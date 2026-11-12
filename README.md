# 설탭 고등 영어 커리큘럼

- `index.html` 정규 수업 페이지
- `exam.html` 내신 대비 일정 (Notion에서 자동으로 채워짐)
- `scripts/sync-notion.mjs` Notion 일정을 읽어 `exam.html`에 넣는 스크립트
- `.github/workflows/deploy.yml` 15분마다 Notion을 확인하고 GitHub Pages에 배포
- `notion-import.csv` 현재 일정 (Notion에 처음 한 번 가져오기용)

## 1. Notion 준비

1. Notion에서 `가져오기 → CSV`로 `notion-import.csv`를 불러와 데이터베이스를 만듭니다.
2. 열 종류를 다음처럼 맞춥니다. 열 이름은 글자 그대로 같아야 합니다.

   | 열 이름 | 종류 | 설명 |
   |---|---|---|
   | 수업 | 제목 | 페이지에는 안 나옴. 메모용 |
   | 날짜 | 날짜 | 비워 두면 그 행은 페이지에 안 나옴 |
   | 빈칸 테스트 | 텍스트 | |
   | 지문 설명 | 텍스트 | |
   | 숙제 | 텍스트 | 줄바꿈도 그대로 반영 |
   | 구분 | 선택 | `수업` 또는 `시험` |

3. `학교 시험` 행은 날짜에서 **종료일**을 켜고 12.10 ~ 12.16처럼 기간을 넣습니다. 이 기간이 페이지의 "시험 예상 기간"이 됩니다.
4. https://www.notion.so/profile/integrations 에서 **새 내부 통합**을 만들고 시크릿(`ntn_…`)을 복사합니다. 권한은 "콘텐츠 읽기"만 있으면 됩니다.
5. 데이터베이스 페이지 오른쪽 위 `⋯ → 연결 → 방금 만든 통합`을 추가합니다. (이걸 빼먹으면 404 오류가 납니다)
6. 데이터베이스 링크를 복사해 둡니다. 링크 전체를 그대로 써도 됩니다.

## 2. GitHub 준비

1. 새 저장소를 **Public**으로 만들고 이 폴더의 파일을 모두 올립니다. `.github` 폴더도 꼭 함께 올려야 합니다. (Mac에서는 `Cmd + Shift + .`로 숨김 폴더가 보입니다)
2. `Settings → Secrets and variables → Actions → New repository secret`
   - `NOTION_TOKEN` : 통합 시크릿
   - `NOTION_DATABASE_ID` : 데이터베이스 링크
3. `Settings → Pages → Source`를 **GitHub Actions**로 바꿉니다.
4. `Actions` 탭 → `Notion 일정 반영 후 배포` → `Run workflow`
5. 초록 체크가 뜨면 `https://<깃허브아이디>.github.io/<저장소이름>/` 에서 열립니다.
   내신 페이지는 끝에 `exam.html`을 붙이면 됩니다.

## 평소 사용

- Notion만 고치면 됩니다. 15분 안팎(가끔 30분)이면 페이지에 반영됩니다.
- 바로 반영하고 싶으면 `Actions → Run workflow`를 누릅니다.
- 날짜를 비워 두면 그 행은 숨겨집니다. 아직 확정 안 된 수업은 날짜만 비워 두세요.
- Notion 연결에 문제가 생기면 배포가 멈추고 **기존 페이지가 그대로** 유지됩니다. Actions 탭의 빨간 표시를 눌러 오류 문구를 확인하세요.
- 저장소에 60일 동안 아무 변경이 없으면 GitHub가 15분 자동 실행을 멈춥니다. 안내 메일이 오면 Actions 탭에서 다시 켜 주세요.
- 정규 수업 페이지(`index.html`)는 Notion과 연결되어 있지 않습니다. 고칠 때는 GitHub에서 파일을 직접 수정하면 몇 분 뒤 반영됩니다.
