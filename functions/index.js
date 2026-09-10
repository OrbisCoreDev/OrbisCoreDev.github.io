const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { normalizeAttendancePayload, mergeAttendanceEntry } = require('./attendance-data');

initializeApp();

const db = getFirestore();
const koreanHolidayApiKey = defineSecret('DATA_GO_KR_SERVICE_KEY');
const REGION = 'asia-northeast3';
const HOLIDAY_API_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const SEOUL_TIME_ZONE = 'Asia/Seoul';
const KTT_PEAK_INTERVAL_MS = 30 * 1000;

function getSeoulDateTime(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: SEOUL_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit'
    });
    const values = Object.fromEntries(
        formatter.formatToParts(date)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value])
    );
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: SEOUL_TIME_ZONE,
        weekday: 'short'
    }).format(date);

    return {
        dateKey: `${values.year}-${values.month}-${values.day}`,
        hour: Number(values.hour),
        minute: Number(values.minute),
        weekday
    };
}

function isWeekend(weekday) {
    return weekday === 'Sat' || weekday === 'Sun';
}

async function isKoreanHoliday(dateKey) {
    const holiday = await db.collection('workHolidays').doc(dateKey).get();
    return holiday.exists && holiday.data().isHoliday === true;
}

function getKTTelecopSyncPlan(now, nonWorkingDay) {
    if (nonWorkingDay) {
        return now.hour === 0 && now.minute === 5
            ? { calls: 1, reason: 'non-working-day' }
            : null;
    }

    const morningPeak = now.hour === 8 || (now.hour === 9 && now.minute <= 30);
    const eveningPeak = now.hour === 18;
    if (morningPeak || eveningPeak) {
        return { calls: 2, intervalMs: KTT_PEAK_INTERVAL_MS, reason: 'peak' };
    }

    return now.minute % 30 === 0
        ? { calls: 1, reason: 'regular' }
        : null;
}

function shouldEvaluateKTTelecopSchedule(now) {
    if (isWeekend(now.weekday)) {
        return now.hour === 0 && now.minute === 5;
    }

    const morningPeak = now.hour === 8 || (now.hour === 9 && now.minute <= 30);
    const eveningPeak = now.hour === 18;
    return (now.hour === 0 && now.minute === 5) || morningPeak || eveningPeak || now.minute % 30 === 0;
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function requestKTTelecopAttendance(_syncContext) {
    // KT텔레캅에서 API 주소·인증 방식·응답 명세를 받으면 이 위치에 서버 요청을 추가합니다.
    // 브라우저가 아닌 Functions에서만 호출하므로 API 키와 출입기록은 외부에 노출되지 않습니다.
    return { configured: false };
}

async function receiveKTTelecopAttendance(syncContext) {
    // 실제 API 연결 시 requestKTTelecopAttendance는 { configured: true, data: JSON응답 }을 반환합니다.
    const response = await requestKTTelecopAttendance(syncContext);
    if (!response.configured) return response;
    const data = normalizeAttendancePayload(response.data);
    const saved = await saveKTTelecopAttendance(data);
    return { configured: true, saved };
}

async function saveKTTelecopAttendance(data) {
    const employees = Object.entries(data.entries);
    if (!employees.length) return 0;
    // 직원과 해당 날짜의 기록을 함께 저장합니다. 로그인 계정/승인 권한은 생성하지 않습니다.
    const dayRef = db.collection('workAttendance').doc(data.date);
    await db.runTransaction(async transaction => {
        const day = await transaction.get(dayRef);
        const employeeRefs = employees.map(([id]) => db.collection('workEmployees').doc(id));
        const employeeDocs = await transaction.getAll(...employeeRefs);
        const entries = Object.assign(Object.create(null), day.data()?.entries || {});
        employees.forEach(([id, entry], index) => {
            entries[id] = mergeAttendanceEntry(entries[id], entry);
            const employee = employeeDocs[index];
            const name = entry.name || employee.data()?.name || '';
            if (!employee.exists) {
                transaction.set(employeeRefs[index], {
                    employeeId: id, name, createdAt: FieldValue.serverTimestamp()
                });
            } else if (name !== employee.data().name) {
                transaction.update(employeeRefs[index], { name });
            }
        });
        transaction.set(dayRef, { ...day.data(), date: data.date, entries });
    });
    return employees.length;
}

async function syncKTTelecopAttendance(plan, now) {
    const syncContext = {
        dateKey: now.dateKey,
        requestedAt: new Date().toISOString(),
        reason: plan.reason
    };

    const results = [await receiveKTTelecopAttendance(syncContext)];
    if (plan.calls === 2) {
        await wait(plan.intervalMs);
        results.push(await receiveKTTelecopAttendance(syncContext));
    }
    return { calls: results.length, configured: results.every(result => result.configured) };
}

function readXmlTag(xml, tagName) {
    const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'));
    return match ? match[1].trim().replace(/&amp;/g, '&') : '';
}

function getEncodedServiceKey(serviceKey) {
    return /%[0-9a-f]{2}/i.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
}

async function fetchHolidaysForMonth(year, month) {
    const serviceKey = koreanHolidayApiKey.value();
    if (!serviceKey) throw new Error('DATA_GO_KR_SERVICE_KEY is not configured.');

    const query = [
        `serviceKey=${getEncodedServiceKey(serviceKey)}`,
        `solYear=${year}`,
        `solMonth=${String(month).padStart(2, '0')}`,
        'numOfRows=100'
    ].join('&');
    const response = await fetch(`${HOLIDAY_API_URL}?${query}`);
    const xml = await response.text();

    if (!response.ok) throw new Error(`공휴일 API 요청 실패: HTTP ${response.status}`);
    const resultCode = readXmlTag(xml, 'resultCode');
    if (resultCode && resultCode !== '00') {
        throw new Error(`공휴일 API 오류 ${resultCode}: ${readXmlTag(xml, 'resultMsg')}`);
    }

    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        .map(([, item]) => ({
            date: readXmlTag(item, 'locdate'),
            name: readXmlTag(item, 'dateName'),
            isHoliday: readXmlTag(item, 'isHoliday') === 'Y'
        }))
        .filter(item => item.isHoliday && /^\d{8}$/.test(item.date));
}

async function syncKoreanHolidays(years) {
    const holidays = [];
    for (const year of years) {
        for (let month = 1; month <= 12; month += 1) {
            holidays.push(...await fetchHolidaysForMonth(year, month));
        }
    }

    const batch = db.batch();
    holidays.forEach(holiday => {
        const dateKey = `${holiday.date.slice(0, 4)}-${holiday.date.slice(4, 6)}-${holiday.date.slice(6, 8)}`;
        batch.set(db.collection('workHolidays').doc(dateKey), {
            date: dateKey,
            name: holiday.name,
            isHoliday: true,
            source: 'data.go.kr',
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    });
    await batch.commit();
    logger.info('한국 공휴일 동기화 완료', { years, count: holidays.length });
    return { years, count: holidays.length };
}

function getSyncYears() {
    const year = new Date().getFullYear();
    return [year, year + 1];
}

exports.syncKoreanHolidaysMonthly = onSchedule({
    region: REGION,
    schedule: '0 3 1 * *',
    timeZone: SEOUL_TIME_ZONE,
    timeoutSeconds: 180,
    secrets: [koreanHolidayApiKey]
}, () => syncKoreanHolidays(getSyncYears()));

exports.syncKoreanHolidaysNow = onCall({
    region: REGION,
    timeoutSeconds: 180,
    secrets: [koreanHolidayApiKey]
}, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    const userDoc = await db.collection('workUsers').doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().isMaster !== true) {
        throw new HttpsError('permission-denied', '마스터 권한이 필요합니다.');
    }
    return syncKoreanHolidays(getSyncYears());
});

// Cloud Scheduler는 분 단위만 지원합니다. 피크 시간에는 한 번 실행된 함수가
// 즉시 호출한 뒤 30초 후 한 번 더 호출해, API 조회를 30초 간격으로 맞춥니다.
exports.syncKTTelecopAttendance = onSchedule({
    region: REGION,
    schedule: '* * * * *',
    timeZone: SEOUL_TIME_ZONE,
    timeoutSeconds: 120
}, async () => {
    const now = getSeoulDateTime();
    if (!shouldEvaluateKTTelecopSchedule(now)) return null;

    const nonWorkingDay = isWeekend(now.weekday) || await isKoreanHoliday(now.dateKey);
    const plan = getKTTelecopSyncPlan(now, nonWorkingDay);
    if (!plan) return null;

    return syncKTTelecopAttendance(plan, now);
});
