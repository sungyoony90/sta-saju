---
name: sta-deploy
description: 현재 프로젝트를 Vercel에 배포하고 실제 URL의 핵심 기능을 재검증한 뒤 상태를 기록할 때 사용합니다.
---

# STA Deploy

배포 명령의 성공과 실제 서비스의 성공을 구분합니다.

## Workflow

1. `docs/PRD.md`, 관련 `docs/specs/` 문서와 `docs/status.md`에서 현재 구현 범위를 확인합니다.
2. 관련 Test, Validation과 `npm run build`를 실행하고 결과를 `PASS`, `FAIL`, `NOT TESTED`로 구분합니다.
3. Git 변경에서 비밀값과 개인정보를 확인합니다. 발견하면 값을 출력하지 말고 배포를 중단합니다.
4. 코드와 `.env.example`에서 필요한 환경변수 이름을 확인합니다. 구현되지 않은 기능의 변수를 가정하지 않습니다.
5. 현재 프로젝트에 맞는 Vercel 배포 방식을 확인하고 배포 오류를 점검합니다.
6. 실제 배포 URL을 열고 현재 구현된 핵심 기능을 다시 확인합니다.
7. 배포 URL, 확인 항목별 결과와 남은 문제를 관련 Spec에 기록하고, 완료된 Spec만 `docs/status.md`에서 체크합니다.

실패한 검증을 통과로 바꾸기 위해 제품 코드를 임의로 수정하지 않습니다. 구현되지 않았거나 실행하지 않은 기능은 `NOT TESTED`로 남깁니다.
