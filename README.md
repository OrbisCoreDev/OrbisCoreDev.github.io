# OrbisCore Work GitHub Pages

업무 페이지 전용 정적 사이트입니다. `index.html`이 GitHub Pages 진입점이며, 공용 CSS·업무 스크립트와 Firebase 연동 파일만 포함합니다.

## Firebase 프로젝트 변경

1. [site-config.js](site-config.js)의 `firebase` 객체를 새 Firebase 웹 앱 설정으로 교체합니다.
2. Firebase Console의 **Authentication → Settings → Authorized domains**에 GitHub Pages 도메인(예: `orbiscoredev.github.io`)을 등록합니다.
3. 프로젝트 연결 후 규칙과 인덱스는 다음과 같이 배포합니다.

```powershell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore,database
```

`.firebaserc`에는 특정 프로젝트를 고정하지 않았습니다. `firebase use --add`로 이 저장소에 배포할 Firebase 프로젝트를 선택하세요.

GitHub Pages는 이 저장소의 기본 브랜치 `/ (root)`를 배포 원본으로 설정하면 됩니다. `.nojekyll`이 포함되어 있어 정적 파일을 그대로 제공합니다.

## 첫 마스터 지정

`firestore.rules`는 브라우저에서 최초 마스터 권한을 획득하는 기능을 허용하지 않습니다. 첫 마스터는 아래 순서로 한 번만 지정합니다.

1. 사이트에서 이메일 회원가입을 완료합니다.
2. Firebase Console → **Firestore Database → Data → `workUsers`**에서 방금 생성된 사용자 문서를 엽니다.
3. `isApproved`와 `isMaster`를 모두 `true`로 수정해 저장합니다.

이후에는 해당 마스터가 페이지의 회원 관리 화면에서 가입 요청을 승인하거나 마스터 권한을 부여할 수 있습니다.
