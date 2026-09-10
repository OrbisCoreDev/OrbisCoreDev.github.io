// entries 키는 텔레캅 멤버번호입니다. 선행 0을 보존하기 위해 문자열로 유지합니다.
// Firebase 로그인 UID와는 별개이며 source는 수신되어도 사용하지 않습니다.
function normalizeAttendancePayload(payload) {
    const date = payload?.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        throw new Error('근태 date는 유효한 YYYY-MM-DD여야 합니다.');
    }
    if (!payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
        throw new Error('근태 entries는 텔레캅 멤버번호를 키로 하는 객체여야 합니다.');
    }
    const entries = Object.fromEntries(Object.entries(payload.entries).map(([uid, entry]) => {
        if (!uid || uid !== uid.trim() || uid.includes('/') || uid === '.' || uid === '..'
            || /^__.*__$/.test(uid) || Buffer.byteLength(uid, 'utf8') > 1500
            || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error('근태 사용자 키 또는 기록 형식이 올바르지 않습니다.');
        }
        if (typeof entry.name !== 'string') throw new Error('근태 name은 문자열이어야 합니다.');
        const normalized = { name: entry.name };
        for (const field of ['checkIn', 'checkOut']) {
            const time = entry[field];
            if (time === undefined) continue;
            if (time !== null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
                throw new Error(`${field}는 HH:mm 또는 null이어야 합니다.`);
            }
            normalized[field] = time;
        }
        return [uid, normalized];
    }));
    return { date, entries };
}

// 반복 조회의 빈 값이 기존 시간을 지우지 않도록 합니다. 휴가 등 다른 필드는 보존합니다.
function mergeAttendanceEntry(existing = {}, incoming) {
    const { source, ...merged } = existing;
    if (incoming.name || !merged.name) merged.name = incoming.name;
    for (const field of ['checkIn', 'checkOut']) {
        if (incoming[field] != null) merged[field] = incoming[field];
    }
    return merged;
}

module.exports = { normalizeAttendancePayload, mergeAttendanceEntry };
