# Usage See

Claude, Gemini, Codex 개인 구독의 5시간·주간 사용량을 한 화면에서 확인하는 macOS·Windows 데스크톱 앱입니다. 별도의 항상 위에 표시되는 위젯 창도 제공합니다.

## 실행

Node.js 22 이상에서:

```bash
npm install
npm start
```

앱의 **설정**에서 Codex 또는 Claude를 연결하면 설치된 CLI 로그인 상태를 확인합니다. 로그인하지 않았다면 각 CLI의 로그인 절차가 시스템 기본 브라우저(Chrome, Arc 등)를 엽니다. Codex는 공식 app-server에서 5시간·주간 사용률을 직접 읽습니다. Claude는 Claude Code 상태줄 입력에 제공되는 5시간·7일 사용률을 읽습니다. Claude는 연결 후 Claude Code에서 메시지를 보내야 첫 값이 표시됩니다. 기존 상태줄 명령은 이어 실행합니다.

Gemini는 브라우저에서 사용량 화면을 복사한 뒤 **복사한 내용 읽기**를 누릅니다. 설정하지 않은 서비스는 대시보드와 위젯에서 숨깁니다. **위젯 띄우기**를 누르면 화면 위에 작은 창이 열립니다.

## 패키징

```bash
npm run package:mac   # Apple Silicon macOS 앱
npm run package:mac-intel # Intel macOS 앱
npm run package:win   # x64 Windows 앱
```

결과물은 `dist/`에 생성됩니다. 배포용 서명·공증은 별도로 설정해야 합니다. Windows 패키지는 Windows에서, macOS 패키지는 macOS에서 실제 실행 확인이 필요합니다.

## 동작 원칙

- Codex는 CLI의 `account/rateLimits/read`를 사용합니다. CLI 인증 정보는 앱이 읽거나 저장하지 않습니다.
- Claude는 공식 Claude Code `statusLine`의 `rate_limits` 데이터를 사용합니다. 연결 시 `~/.claude/settings.json`에 브리지 명령을 설치하고 최근 입력을 `~/.usage-see/claude-statusline.json`에 로컬 저장합니다. 기존 상태줄 명령은 보존합니다. Claude Code가 실행되어 새 입력을 전달할 때 값이 갱신됩니다.
- Gemini는 사용량 화면에서 복사한 텍스트만 읽습니다. 텍스트 원문은 저장하지 않습니다.
- 사용률이 제공되지 않는 창은 임의로 0%로 채우지 않습니다. 15분이 지났거나 초기화된 값은 오래된 정보로 표시합니다.
- 앱은 계정 비밀번호와 OAuth 토큰을 저장하거나 자체 서버로 전송하지 않습니다.

## 디자인 참고

`usage-mac`의 SwiftUI 위젯에서 좁은 서비스 카드, 경고색 막대, 확인 시각과 출처 표시를 현재 앱에 반영했습니다. 채택한 요소와 제외한 범위는 [디자인 검토](docs/usage-mac-review.md)에 정리했습니다.

## 검증

```bash
npm test
```

파서와 로컬 상태 관리를 검증합니다. Codex CLI 사용량 조회는 이 기기의 로그인 계정으로 실행 확인했습니다. Claude 값은 상태줄이 다음 데이터를 전달하면 표시됩니다.

## 참고

- [Claude 사용량 설정](https://support.claude.com/en/articles/9797557-usage-limit-best-practices)
- [Gemini Apps 사용량 한도](https://support.google.com/gemini/answer/16275805?hl=en)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Claude Code 상태줄](https://code.claude.com/docs/en/statusline)
