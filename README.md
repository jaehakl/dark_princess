DB 를 다음과  같이 변경한다.

1. Scene
- prompt
- embedding (vector 1024)
- scripts (JSON)
- status_change (JSON)

2. SceneOption
- scene_id
- option_text
- embedding (vector 1024)

3. Status
- name: Mapped[str] = mapped_column(Text, nullable=False)
- turn: Mapped[int] = mapped_column(Integer, nullable=False)
- cash: Mapped[int] = mapped_column(Integer, nullable=False)
- strength: Mapped[int] = mapped_column(Integer, nullable=False)
- agility: Mapped[int] = mapped_column(Integer, nullable=False)
- intelligence: Mapped[int] = mapped_column(Integer, nullable=False)
- sense: Mapped[int] = mapped_column(Integer, nullable=False)
- attractiveness: Mapped[int] = mapped_column(Integer, nullable=False)
- toughness: Mapped[int] = mapped_column(Integer, nullable=False)
- stress: Mapped[int] = mapped_column(Integer, nullable=False)
- context_embedding (vector 1024)
- selection_model_id

4. SelectionModel
- name
- file_url


<Services>

1. Next Scene 결정 API
(API Level)
Input : Scene id, Status id, Scene Option id
Output : SceneBase

(Service 함수 Level)
(1) 받은 id 들로 Scene, Scene Option, Status 를 불러옴
(2) Scene.embedding, SceneOption.embedding, Status.context_embedding 을 input 으로 받아서, target Scene embedding (vec 1024) 을 output 으로 내놓는 함수를 만들고, 이를 통해 target Scene embedding 을 구함 (일단 무작위로 생성하도록 하고, 갈아끼우기 쉽도록 모듈화 )
(3) Status.context_embedding = Status.context_embedding*0.9 + Scene.embedding 로 갱신
(4) target Scene embedding 과 가장 가까운 Scene 을 찾아 반환


2. Scene 생성 API
Input : scene_id (optional), prompt, scripts (JSON), status_change (JSON)
Output : SceneBase

- prompt + scripts 기반으로 embedding 생성
- prompt 기반으로 image 생성(로컬 폴더에 저장)
- 받은 정보에 해당 embedding 및 image_url 포함시켜 Scene 생성 후 반환 (scene_id 가 주어진 경우에는 해당 레코드에 update)


Next Scene 결정 서비스 함수에서 Normalized Status columns (int 값들만) 도 input 으로 받도록 하고, 다음 API 를 추가해 줘.

3. Model 생성 API
Input : model_id, name, parameters(JSON)
Output : SelectionModelBase

- parameters 기반으로 Scene.embedding, SceneOption.embedding, Status.context_embedding, Normalized Status columns 를 input 으로 받아서  target Scene embedding 을 output 으로 내놓는 DNN 모델 (일단 무난하게 놓고, 추후 하이퍼파라미터 최적화가 용이하도록 코드를 적절히 추상화할 것) 생성
- 파일로 저장(각종 필요한 메타정보들도 다 포함시킬 것) 후 file_url 밀 name 을 넣어 SelectionModel 레코드 생성
- SelectionModelBase 반환

4. SceneOption 생성 API
Input : scene_id, option_text
Output : SceneOptionBase

- option_text 로 embedding 생성한 후 레코드 생성

Input : 
- Context : Scene history Embedding (embedding 을 x0.9 하면서 누적 평균) 
- Normalized Status
- Scene Option Embedding

Output : 
- target Scene embedding (mutation, reroll)


<User Interface>
[랜딩 페이지 : Create/Select Status]
- 좌측 기존 Status 목록
- 우측 Status 능력치 + 모델 정보 패널
- Status 능력치 Shuffle 가능
- 모델 생성/선택 가능
- Status 능력치/Model 확정 후 "Status 생성" 가능
- Status 선택 시 플레이 페이지로 이동

[플레이 페이지] (status_id 가 포함된 url 로 랜딩페이지 안 거치고 다이렉트로 올 수 있음)

[Scene Panel] (왼쪽)
- Scene image

[Control Panel] (아래)
- Scene scripts 가 순차적으로 나오고, 마지막으로 Scene Options 를 표시
- Scene Options 중 선택 시  Next Scene 결정 API 로 다음 Scene 받아옴
- 다음 Scene 받아오면 status_change 값에 따라 Status update

[Status Panel] (오른쪽)
- Status 표시
- status_change 로 인해 수치가 바뀌면 그 때 마다 명확히 인식 가능하게 시각화해줌


[Scene 생성/편집 모달]
- scene_id : 현재 scene 이 디폴트로 선택되어 있으며, 새로 생성(scene_id 를 null 로) 도 toggle 가능
- prompt 편집
- scripts 배열 추가/편집/삭제
- 버튼을 눌러 Scene 생성 API 로 보냄. (재시도하면 그림 재생성이 됨.)
- 생성 중 적절히 스피너 표시 및 완료 후 업데이트

[Scene 탐색 모달]
- 전체 Scene list 를 일단 받아와서 표시
- 페이지네이션 적용, 이미지도 썸네일처럼 표시, script 는 축약하여 표시, prompt 는 미표시
- 검색창에서 검색하면 검색어로 script 및 prompt 에서 실시간으로 프론트엔드에서 탐색하여 필터링


[SceneOption 생성 API]
Input : scene_id, option_text
Output : SceneOptionBase

- option_text 로 embedding 생성한 후 레코드 생성

[SceneOption 생성/편집 모달]
- 현재 scene 의 옵션 목록에서, 각 option 에서 편집 버튼을 눌러 띄울수도 있고, 옵션 목록 하단에 새 옵션 추가 버튼을 눌러 띄울수도 있음(버튼은 작게 만들 것)
- 텍스트 편집 후 저장(SceneOption 생성 API 사용)

[Actions]
- New Option for current Scene
- Modify/Delete This Scene
- Create and connect/replace This Scene

[Scene Edit Modal]
- prompt
- Script
- Generate Image
- set status change


