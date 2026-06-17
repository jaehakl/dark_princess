
이미지 생성기를 다음과 같이 새로 만든다.

- components/image-editor 폴더 안에 여러 파일로 나눠서 코딩한다.
- 간결성, 유지보수성, 확장성에 유의하여 코딩한다.

# 이미지 생성기 컴포넌트 개발 계획

<props> 
- 이미지 생성 파라미터, 칼럼별 프롬프트, base image url, scribble image url, pose image url
- onSubmit (generate 실행), onParameterUpdated (resolution 등 이미지 생성 파라미터 편집 시 호출)

<컴포넌트 내부 데이터>
- image canvas
- base image png 파일 원본
- image object (List [])
- prev_image
- mask canvas
- scribble canvas
- pose image
- preference (canvas overlap 여부 toggle 상태, brush size 등)
- history (canvas 별, 이동 등 변경 내역을 JSON, 벡터 데이터로)

<레이아웃>
- resolution 변경 shortcut
- canvas 별 고유 탭 selector (null 여부를 알 수 있어야 함)
- (탭) 탭별 도구모음 + 탭별 캔버스
- Submit 버튼

<OnSubmit 후 동작>
- 컴포넌트 내부 데이터는 OnSubmit 후 이미지가 reload 되어도 계속 유지
- base image url 이 바뀐 경우 -> base image png 파일 원본과 image object 들을 prev_image 에 캐싱하고, 새 base image png 파일 원본, image object ([]) 업데이트
- scribble image url 이 바뀐 경우 -> scribble canvas 업데이트
- pose image url 이 바뀐 경우 -> pose image 업데이트

<탭별 UI>
[image]
- 1단계 도구모음
     * 사각형 select
     * object 선택 (2단계 -> 좌우반전)
     * Feather 브러시(2단계 -> 굵기 조절)
     * undo
     * redo
     * mask overlap 여부 toggle
     * scribble overlap 여부 toggle
     * image 초기화 (base image, image object 비움)
- 2단계 도구모음
     * 1단계 도구 별 2단계 도구 표시
- canvas 디스플레이
     * 프레임은 1:1 비율로 고정 프레임 (background : black)
     * canvas 는 가로와 세로 중 긴 쪽을 프레임 폭에 맞춤 (background : white)
     * resolution 이 변경되면 canvas 새로 생성
     * base image 는 canvas 안에 맞춤하여 canvas 위에 표시(canvas 와 width 나 height 중 하나가 일치하면서 canvas 안에 들어오게), base image 자체는 편집되지 않음
     * image object 는 base image 위에 overlap 하여 표시
          - canvas 에서 select하고 ctrl + c 하면 클립보드에 해당 영역 canvas + base image + object merge 된 (보이는 그대로의) 이미지 복사
          - 어디서 복사되었건, ctrl + v 하면 image object 추가됨
          - image object 가 선택된 상태에서, 좌우반전, delete 키로 삭제, resize, rotate, move, ctrl+c 로 해당 object 이미지 클립보드에 복사 가능
          - image object 변경 내역은 history 로 저장, undo, redo 가능
     * Feather 브러시로 문지르면 merge 된 image (보이는 그대로의) 기반으로 처리하여 blur 된 결과물로 새로운 object 생성
     * Submit 시, canvas, canvas 위에 올려진 base image, image object merge 하여 canvas 사이즈와 같은 image 만들어 Submit
     (단, base image 와 image object 가 모두 없는 경우에는 image 가 없는 것으로 간주하고 null 로 submit)
     

[mask]
- 도구모음
     * mask 표시 투명도 설정
     * undo
     * redo
     * base image 만 black, 나머지 white
     * 선택 영역 black
     * 선택 영역 white
     * 전체 black
     * 전체 white

- canvas 디스플레이
     * 프레임은 1:1 비율로 고정 프레임 (background : black)
     * canvas 는 가로와 세로 중 긴 쪽을 프레임 폭에 맞춤 (background : white)
     * resolution 이 변경되면 canvas 새로 생성
     * image canvas (canvas + image + object, 단 상호작용은 불가)
     * mask canvas (white 영역을 반투명한 노란색으로 표시, black 은 그냥 투명으로)
     * resolution 이 변경되면 canvas 새로 생성
     * 마우스로 드래그하여 선택한 후 delete 키로 black, enter 키로 white (또는 도구모음 버튼)
     * mask canvas 디폴트값은 전체 white
     * mask 선택 변경 내역은 history 로 저장, undo, redo 가능
     * Submit 시, mask canvas 가 전체 white 인 경우에는 mask 가 없는 것으로 간주하고 null 로 submit

[scribble]
- 도구모음
     * scale, start, end 변경
     * scribble 표시 투명도 설정
     * brush 굵기 설정
     * undo
     * redo
     * 초기화 (전체 white)     

- canvas 디스플레이 
     * 프레임은 1:1 비율로 고정 프레임 (background : black)
     * canvas 는 가로와 세로 중 긴 쪽을 프레임 폭에 맞춤 (background : white)
     * resolution 이 변경되면 canvas 새로 생성
     * brush 로 그리면 black 으로 칠해지며, 변경 내역은 history 로 저장, undo, redo 가능     
     * Submit 시,
          - scribble canvas 가 전체 white 인 경우에는 scribble 이 없는 것으로 간주하고 null 로 submit
          - scribble 이 있지만 한 번도 수정하지 않은 경우에는 scribble image url 원본으로 submit

[pose]
- 도구모음
     * scale, start, end 변경
     * 초기화 (set null)

- pose image 디스플레이 
     * 프레임은 resolution 에 따라 변경     
     * pose image 는 프레임 사이즈에 맞게 crop 하여 표시하며, 마우스 스크롤로 zoom in , zoom out 및 클릭하여 상하좌우로 이동 가능
     * 클립보드에서 붙여넣으면 pose image 변경
     * Submit 시
          - 프레임으로 crop 된 상태 (화면에 표시되는 부분) 로 pose image 생성하여 submit
          - pose image 가 전체 black 인 경우에는 pose image 가 없는 것으로 간주하고 null 로 submit
          - pose image 이 있지만 한 번도 수정하지 않은 경우에는 pose image url 원본으로 submit

