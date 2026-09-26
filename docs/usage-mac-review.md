# `usage-mac` 디자인 검토

현재 제품은 Electron 데스크톱 앱이다. `usage-mac`의 SwiftUI 메뉴바 앱에서 아래 화면 패턴을 참고하고, 기존 Electron 수집·저장 구조는 유지한다.

| 채택 | 참조 코드 | 반영 위치 |
| --- | --- | --- |
| 좁은 서비스 카드와 5시간·주간 두 줄 | `UI/WidgetView.swift`의 `ProviderCard`, `SlotRow` | 대시보드와 위젯의 카드 |
| 얇은 진행 막대, 80%·95% 경고색 | `UI/WidgetView.swift`의 `UsageBar` | 대시보드와 위젯의 사용률 막대 |
| 마지막 확인 시각과 출처 표시 | `UI/WidgetView.swift`의 `WidgetView`, `Badge` | 위젯 상단과 카드 하단 |
| 초기화 시각을 값 옆에 보여주기 | `UI/WidgetView.swift`의 `MeterLine` | 위젯의 각 사용량 줄 |
| 값을 모르면 0으로 채우지 않기 | `Domain/Models.swift`의 `QuotaSnapshot` | 기존 `확인 필요` 상태 유지 |

## 가져오지 않은 부분

- `usage-mac`은 미설정 공급자와 API·잔액 칸까지 항상 표시한다. 현재 앱은 **연결한 공급자만** 보여주며 개인 구독의 5시간·주간 수치만 다룬다.
- Claude statusline 브리지, Codex app-server, 조직 API 비용, Keychain 자격증명, 플로팅 패널 위치 저장은 이번 작업의 범위 밖이다.
- `GeminiPlanAdapter`의 “Gemini에 5시간·주간 창이 없다”는 설명은 Gemini CLI를 대상으로 작성되었다. 현재 앱은 Gemini **웹앱 개인 구독**을 대상으로 하므로 적용하지 않는다.

`usage-mac`의 빌드 결과물과 로컬 설정은 저장소에 추가하지 않는다.
