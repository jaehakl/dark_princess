GEN_IMAGE_POSITIVE_BASE = "masterpiece, best quality"
GEN_IMAGE_NEGATIVE_PROMPT = "low quality, blurry, jpeg artifacts, watermark, signature, text, logo, distorted, deformed face"




GEN_IMAGE_STEPS = 30
GEN_IMAGE_CFG = 5
GEN_IMAGE_STRENGTH = 1.0
GEN_IMAGE_SCRIBBLE_SCALE = 0.6
GEN_IMAGE_SCRIBBLE_GUIDANCE_START = 0.0
GEN_IMAGE_SCRIBBLE_GUIDANCE_END = 0.6
GEN_IMAGE_POSE_SCALE = 0.9
GEN_IMAGE_POSE_GUIDANCE_START = 0.0
GEN_IMAGE_POSE_GUIDANCE_END = 0.8
GEN_IMAGE_SAMPLER = "euler_a"
GEN_IMAGE_SCHEDULER = ""
GEN_IMAGE_CLIP_SKIP: int | None = None
GEN_IMAGE_HEIGHT = 1024
GEN_IMAGE_WIDTH = 1024
GEN_IMAGE_MAX_CHUNK_SIZE = 1
GEN_IMAGE_OUTPUT_FORMAT = "PNG"
GEN_IMAGE_OUTPUT_EXTENSION = ".png"
GEN_IMAGE_OUTPUT_QUALITY = 85
GEN_IMAGE_SEED_MIN = 0
GEN_IMAGE_SEED_MAX = 1_000_000
RECOMMEND_PROMPT_DISTANCE_EPSILON = 1e-6
GEN_IMAGE_ALLOWED_SAMPLERS = {"", "euler", "euler_a", "dpmpp_2m", "unipc"}
GEN_IMAGE_ALLOWED_SCHEDULERS = {"", "karras"}
GEN_IMAGE_MODEL_FILE_EXTENSIONS = {".safetensors", ".ckpt"}
SCENE_PROMPT_FIELDS = ("prompt_situation", "prompt_hero", "prompt_camera", "prompt_detail")
WD14_TAGGER_MODEL_ID = "SmilingWolf/wd-eva02-large-tagger-v3"
WD14_DEFAULT_GENERAL_THRESHOLD = 0.35
WD14_DEFAULT_CHARACTER_THRESHOLD = 0.85



GEN_IMAGE_CAMERA_SAMPLES ={
  "카메라_거리_쇼트크기": {
    "extreme close-up": "눈, 입술, 손끝처럼 아주 작은 디테일을 화면 가득 보여주는 초근접 샷",
    "close-up": "얼굴이나 특정 사물을 크게 보여 주는 근접 샷",
    "medium close-up": "가슴 위나 어깨 위 인물을 중심으로 보여 주는 샷",
    "medium shot": "허리 위 인물과 주변 상황을 함께 보여 주는 중간 거리 샷",
    "medium full shot": "무릎 위 정도까지 보여 주어 인물과 자세를 함께 드러내는 샷",
    "cowboy shot": "허벅지 위까지 잡는 서부극식 인물 샷",
    "full shot": "인물의 전신을 화면 안에 담는 샷",
    "full-body shot": "전신이 명확하게 보이도록 유도하는 샷",
    "long shot": "인물보다 배경과 공간감이 더 강조되는 먼 거리 샷",
    "wide shot": "장면 전체와 공간 배치를 넓게 보여 주는 샷",
    "extreme wide shot": "인물이 작게 보일 정도로 거대한 환경을 강조하는 초광각 장면",
    "establishing shot": "장소, 시대, 분위기를 먼저 설명하는 도입부 같은 장면",
    "environmental shot": "인물보다 주변 환경과 관계성을 강조하는 장면",
    "panoramic shot": "좌우로 넓게 펼쳐진 풍경이나 대규모 장면",
    "macro shot": "곤충, 꽃, 물방울, 질감 같은 작은 대상을 크게 확대하는 샷"
  },

  "구도": {
    "centered composition": "주 피사체를 화면 중앙에 배치해 안정감과 상징성을 주는 구도",
    "rule of thirds": "화면을 3분할해 자연스럽고 균형 잡힌 배치를 만드는 구도",
    "symmetrical composition": "좌우 또는 상하가 대칭인 정돈된 구도",
    "asymmetrical composition": "대칭은 아니지만 시각적 무게가 균형을 이루는 구도",
    "balanced composition": "인물, 배경, 소품의 시각적 무게가 안정적으로 배치된 구도",
    "dynamic composition": "사선, 움직임, 긴장감이 살아 있는 역동적인 구도",
    "diagonal composition": "사선 방향으로 시선과 움직임을 만드는 구도",
    "triangular composition": "피사체들을 삼각형 구조로 배치해 안정감과 집중도를 주는 구도",
    "radial composition": "중심에서 바깥으로 퍼지거나 바깥에서 중심으로 모이는 구도",
    "layered composition": "전경, 중경, 배경을 층처럼 나누어 깊이감을 만드는 구도",
    "leading lines": "길, 빛, 건축선 등이 시선을 특정 지점으로 이끄는 구도",
    "S-curve composition": "S자 곡선 흐름으로 부드러운 시선 이동을 만드는 구도",
    "frame within a frame": "문, 창문, 아치 같은 프레임 안에 피사체를 배치하는 구도",
    "negative space": "빈 공간을 크게 남겨 고독감, 여백, 집중감을 주는 구도",
    "foreground framing": "전경의 사물로 화면 가장자리를 감싸 깊이와 몰입감을 주는 구도",
    "deep composition": "앞뒤 거리감이 크게 느껴지는 깊은 구도",
    "clear focal point": "시선이 향해야 할 핵심 지점이 분명한 구도",
    "cinematic composition": "영화 장면처럼 인물, 배경, 빛, 시선 흐름이 연출된 구도"
  },

  "피사체_배치": {
    "centered subject": "주 피사체를 화면 중앙에 두어 명확하게 강조",
    "off-center subject": "피사체를 중앙에서 살짝 벗어나게 배치해 자연스러운 긴장감 생성",
    "subject in the foreground": "피사체가 화면 앞쪽에 크게 위치",
    "subject in the midground": "피사체가 중간 거리에 있어 배경과 함께 읽히는 배치",
    "subject in the background": "피사체가 뒤쪽에 있어 공간이나 상황을 강조",
    "foreground silhouette": "전경의 인물을 실루엣으로 보여 주어 분위기와 깊이감 강조",
    "background figures": "배경에 작은 인물들을 배치해 장면의 규모나 사회적 맥락을 추가",
    "isolated subject": "피사체를 홀로 두어 고독감, 집중감, 상징성을 부여",
    "overlapping figures": "인물들이 겹쳐 보이며 밀도, 혼잡함, 관계성을 표현",
    "clustered figures": "인물들이 한곳에 모여 있는 배치",
    "evenly spaced figures": "인물들이 일정 간격으로 배치되어 질서감 생성",
    "foreground and background separation": "전경과 배경이 명확히 분리되어 입체감 강화",
    "small figure in a vast environment": "거대한 배경 속 작은 인물로 압도감이나 고독감 표현",
    "dominant foreground subject": "전경의 피사체가 화면을 지배하도록 크게 배치"
  },

  "인물_수와_관계": {
    "three-person composition": "세 인물의 관계나 긴장을 보여 주기 좋은 구성",
    "ensemble cast": "여러 주요 인물이 모두 중요하게 배치된 구성",
    "face-to-face": "두 인물이 마주 보는 대립, 대화, 친밀감의 구도",
    "side-by-side": "인물들이 나란히 있어 동행, 연대, 비교를 표현",
    "back-to-back": "등을 맞대고 있는 구도, 협력이나 긴장감을 표현",
    "surrounding figures": "한 인물을 여러 인물이 둘러싼 장면",
    "interacting characters": "인물들이 서로 행동이나 감정으로 연결된 장면",
    "separated characters": "인물들이 떨어져 있어 거리감, 갈등, 단절을 표현",
    "foreground protagonist": "주인공을 전경에 배치해 장면의 중심으로 만듦",
    "background onlookers": "배경의 구경꾼들을 통해 사건성과 사회적 분위기를 추가"
  },

  "카메라_각도": {
    "eye-level shot": "눈높이 시점으로 자연스럽고 현실적인 인상을 줌",
    "high-angle shot": "위에서 내려다봐 피사체를 작고 약하게 보이게 함",
    "low-angle shot": "아래에서 올려다봐 피사체를 강하고 위압적으로 보이게 함",
    "bird's-eye view": "새가 내려다보는 듯한 높은 시점",
    "worm's-eye view": "땅바닥에서 올려다보는 극단적인 낮은 시점",
    "overhead shot": "정수리 위에서 수직으로 내려다보는 시점",
    "top-down view": "지도처럼 위에서 아래로 보는 시점",
    "ground-level shot": "카메라가 바닥 가까이에 있어 현장감과 긴장감을 줌",
    "hip-level shot": "허리 높이에서 보는 자연스럽고 거리감 있는 시점",
    "shoulder-level shot": "어깨 높이에서 보는 안정적인 인물 중심 시점",
    "Dutch angle": "화면을 기울여 불안감이나 혼란을 주는 각도",
    "canted angle": "Dutch angle과 비슷하게 화면을 비스듬히 기울인 각도",
    "oblique angle": "정면이 아닌 비스듬한 시점으로 입체감과 긴장감을 줌"
  },

  "시점과_방향": {
    "front view": "정면에서 보는 시점",
    "side view": "측면에서 보는 시점",
    "profile view": "인물의 옆얼굴을 강조하는 시점",
    "rear view": "뒤에서 바라보는 시점, 미스터리나 여정의 느낌을 줌",
    "point-of-view shot": "인물의 눈으로 보는 듯한 주관적 시점",
    "first-person perspective": "1인칭 게임이나 체험 장면처럼 보이는 시점",
    "aerial viewpoint": "공중에서 내려다보는 넓은 시점",
    "spectator viewpoint": "관객이 현장을 지켜보는 듯한 시점",
    "looking through a doorway": "문 너머로 장면을 바라보는 구도",
    "looking through a window": "창문 너머로 장면을 바라보는 구도"
  },

  "렌즈와_화각": {
    "ultra-wide-angle lens": "매우 넓은 화각으로 공간을 과장하고 웅장하게 보이게 함",
    "wide-angle lens": "넓은 공간과 원근감을 강조",
    "14mm lens": "극단적인 광각, 왜곡과 스케일이 강함",
    "24mm lens": "풍경, 실내, 영화적 장면에 자주 쓰이는 넓은 화각",
    "35mm lens": "자연스러운 환경 인물 장면에 어울리는 화각",
    "50mm lens": "사람 눈에 가까운 자연스러운 화각",
    "85mm lens": "인물 중심, 배경 흐림, 압축감에 유리한 렌즈",
    "135mm lens": "강한 배경 압축과 인물 분리에 유리한 망원 렌즈",
    "telephoto lens": "먼 대상을 당겨 배경을 압축하고 피사체를 분리",
    "macro lens": "작은 대상과 세밀한 질감을 크게 표현",
    "fisheye lens": "어안렌즈처럼 휘어진 왜곡과 독특한 공간감을 만듦",
    "tilt-shift lens": "미니어처 같은 느낌이나 선택적 초점 효과",
    "anamorphic lens": "영화적인 와이드 화면, 타원형 보케, 수평 플레어 느낌"
  },

  "원근법": {
    "one-point perspective": "하나의 소실점으로 시선이 모이는 안정적인 원근",
    "two-point perspective": "건물 모서리나 도시 장면에 잘 맞는 두 소실점 원근",
    "three-point perspective": "높이감이나 극적인 건축물을 표현하는 세 소실점 원근",
    "linear perspective": "선들이 소실점으로 모이는 전통적 원근법",
    "atmospheric perspective": "먼 곳이 흐리고 옅어지는 대기 원근",
    "exaggerated perspective": "공간감과 깊이를 일부러 크게 과장",
    "compressed perspective": "망원렌즈처럼 앞뒤 거리가 납작하게 압축된 느낌",
    "deep perspective": "화면 깊숙이 들어가는 강한 거리감",
    "isometric view": "게임 맵이나 설계도처럼 축이 일정한 등각 시점",
    "foreshortening": "몸이나 사물이 카메라를 향해 짧게 압축되어 보이는 효과"
  },

  "초점과_심도": {
    "shallow depth of field": "배경을 흐리게 하고 피사체에 집중시키는 얕은 심도",
    "large depth of field": "앞뒤가 넓게 선명한 깊은 심도",
    "deep focus": "전경부터 배경까지 선명한 영화적 초점",
    "selective focus": "특정 부분만 선명하게 강조",
    "tack sharp focus": "매우 또렷하고 날카로운 초점",
    "soft focus": "부드럽고 약간 몽환적인 초점",
    "sharp foreground": "전경을 선명하게 강조",
    "sharp background": "배경까지 선명하게 보여 줌",
    "foreground blur": "전경을 흐리게 해 깊이감과 몰입감을 줌",
    "background blur": "배경 흐림으로 피사체를 강조",
    "creamy bokeh": "부드럽고 둥근 배경 흐림",
    "split-diopter effect": "가까운 대상과 먼 대상을 동시에 선명하게 보이게 하는 영화적 효과"
  },

  "움직임과_동세": {
    "dynamic action": "큰 움직임과 에너지가 있는 액션 장면",
    "dynamic pose": "인물의 자세가 역동적으로 보이도록 유도",
    "frozen motion": "빠른 움직임이 순간적으로 멈춘 듯한 표현",
    "freeze-frame": "영화의 정지 화면처럼 결정적 순간을 포착",
    "motion blur": "움직이는 대상이 흐려져 속도감을 줌",
    "long exposure": "긴 노출처럼 빛이나 움직임이 길게 남는 효과",
    "panning shot": "배경은 흐르고 피사체는 따라가는 속도감 있는 표현",
    "zoom blur": "중심으로 빨려 들어가거나 튀어나오는 듯한 줌 흐림",
    "flowing movement": "천, 머리카락, 물, 연기 등이 흐르는 움직임",
    "suspended motion": "공중에 떠 있는 순간처럼 정지된 움직임",
    "windblown fabric": "바람에 휘날리는 옷감",
    "falling debris": "떨어지는 파편으로 사건성과 긴장감 추가",
    "drifting particles": "떠다니는 입자로 분위기와 공간감 강화",
    "splashing water": "튀는 물방울로 생동감 생성",
    "subtle gesture": "작은 손짓이나 몸짓으로 감정 표현",
    "candid movement": "연출되지 않은 듯 자연스러운 움직임"
  },

  "서사와_장면_유형": {
    "storytelling": "이야기 전달을 목적으로 한 일러스트",
    "narrative illustration": "이야기 전달을 목적으로 한 일러스트",
  },

  "조명_성질": {
    "natural light": "자연광 느낌",
    "soft diffused light": "부드럽게 퍼진 빛",
    "hard directional light": "강하고 방향성이 뚜렷한 빛",
    "ambient light": "공간 전체에 은은하게 깔린 빛",
    "bounced light": "벽이나 바닥에 반사되어 부드러워진 빛",
    "practical lighting": "촛불, 램프, 네온 등 장면 안 실제 광원을 이용한 조명",
    "available light": "인공적인 조명 연출 없이 현장에 있는 빛",
    "studio lighting": "스튜디오 촬영처럼 통제된 조명",
    "cinematic lighting": "영화 장면처럼 극적으로 설계된 조명",
    "soft ambient lighting": "부드럽고 은은하게 퍼지는 공간 조명",
    "dappled light": "나뭇잎 사이 햇빛처럼 얼룩진 빛",
    "scattered light": "안개나 먼지에 산란된 빛",
    "volumetric lighting": "공기 중 입자 때문에 빛의 부피가 보이는 효과",
    "light shafts": "창문이나 틈 사이로 들어오는 빛줄기",
    "god rays": "구름, 숲, 창문 사이로 내려오는 장엄한 빛줄기",
    "caustic lighting": "물이나 유리를 통과해 생기는 물결무늬 빛"
  },

  "조명_방향과_패턴": {
    "front lighting": "정면에서 비추는 빛, 얼굴과 형태가 잘 보임",
    "side lighting": "옆에서 비추는 빛, 입체감과 명암이 강해짐",
    "backlighting": "뒤에서 비추는 빛, 실루엣과 윤곽 강조",
    "rim lighting": "피사체 가장자리에 빛 테두리를 만드는 조명",
    "top lighting": "위에서 내려오는 빛, 엄숙하거나 극적인 느낌",
    "underlighting": "아래에서 올라오는 빛, 불안하거나 기괴한 느낌",
    "three-quarter lighting": "정면과 측면 사이에서 비추는 자연스러운 조명",
    "split lighting": "얼굴이나 피사체의 한쪽은 밝고 한쪽은 어두운 조명",
    "Rembrandt lighting": "한쪽 볼에 작은 삼각형 빛이 생기는 고전적 인물 조명",
    "butterfly lighting": "코 아래 나비 모양 그림자가 생기는 정면 위쪽 조명",
    "loop lighting": "코 옆에 작은 그림자가 생기는 자연스러운 인물 조명",
    "silhouette lighting": "피사체를 어둡게 남기고 윤곽만 강조하는 조명"
  },

  "광원과_시간대": {
    "dawn light": "새벽빛, 차갑고 조용한 시작의 느낌",
    "early morning light": "아침 햇살, 맑고 부드러운 느낌",
    "midday sunlight": "정오의 강한 햇빛, 선명하고 그림자가 짧음",
    "golden hour": "해 뜰 무렵이나 해 질 무렵의 따뜻한 황금빛",
    "sunset light": "노을빛, 감성적이고 극적인 분위기",
    "blue hour": "해가 진 직후의 푸른 시간대",
    "twilight": "해질녘이나 새벽녘의 어스름",
    "moonlight": "차갑고 은은한 달빛",
    "starlight": "별빛이 주는 희미하고 신비로운 빛",
    "window light": "창문을 통해 들어오는 부드러운 빛",
    "candlelight": "촛불의 따뜻하고 흔들리는 빛",
    "firelight": "불꽃의 강하고 따뜻한 빛",
    "torchlight": "횃불 조명, 중세나 탐험 장면에 적합",
    "neon light": "강렬한 색의 네온 조명",
    "fluorescent light": "형광등 같은 차갑고 평평한 실내 조명",
    "streetlight": "가로등 불빛, 밤거리 분위기",
    "bioluminescent light": "생물 발광처럼 신비로운 자연광"
  },

  "명암과_대비": {
    "high-key lighting": "전체적으로 밝고 그림자가 적은 조명",
    "low-key lighting": "어두운 영역이 많고 대비가 강한 조명",
    "high contrast": "밝고 어두운 차이가 큰 이미지",
    "low contrast": "명암 차이가 부드럽고 약한 이미지",
    "chiaroscuro": "강한 명암 대비로 고전 회화 같은 극적 효과",
    "dramatic shadows": "강한 그림자로 긴장감과 연극성을 부여",
    "soft shadows": "부드러운 그림자",
    "hard shadows": "경계가 선명한 강한 그림자",
    "deep shadows": "깊고 짙은 어둠",
    "lifted shadows": "그림자가 완전히 검지 않고 부드럽게 열린 톤",
    "bright highlights": "밝은 하이라이트가 두드러지는 이미지",
    "contre-jour": "역광으로 피사체를 드라마틱하게 보이게 하는 방식"
  },

  "색상_팔레트": {
    "warm color palette": "빨강, 주황, 노랑 계열의 따뜻한 색감",
    "cool color palette": "파랑, 청록, 보라 계열의 차가운 색감",
    "neutral color palette": "회색, 베이지, 흰색, 검정 중심의 절제된 색감",
    "analogous colors": "색상환에서 가까운 색끼리 조합한 조화로운 팔레트",
    "complementary colors": "보색 대비를 이용한 강한 색 조합",
    "sepia tones": "갈색빛이 도는 오래된 사진 느낌",
  },

  "색보정과_톤": {
    "cinematic color grading": "영화 후반작업처럼 색을 연출한 느낌",
    "filmic color grading": "필름 사진이나 영화 필름 같은 색감",
    "natural color grading": "과장되지 않은 자연스러운 색보정",
    "warm color grade": "전체적으로 따뜻한 색보정",
    "cool color grade": "전체적으로 차가운 색보정",
    "vintage color grading": "오래된 필름이나 과거 사진 같은 색보정",
    "faded film look": "빛바랜 필름 느낌",
    "bleach bypass": "채도는 낮고 대비는 강한 거친 영화적 톤",
    "cross-processed colors": "비현실적이고 독특한 필름 현상 색감",
    "crushed blacks": "검은 영역을 깊게 눌러 강한 대비 생성",
    "lifted blacks": "검은 영역을 회색 쪽으로 올려 부드러운 필름 느낌",
    "soft highlight roll-off": "밝은 영역이 부드럽게 넘어가도록 표현",
    "high dynamic range": "밝은 곳과 어두운 곳의 정보가 모두 풍부한 톤"
  },

  "날씨와_대기": {
    "clear atmosphere": "맑고 투명한 공기",
    "overcast sky": "흐린 하늘, 부드럽고 평평한 빛",
    "cloudy": "구름이 많은 날씨",
    "foggy": "안개가 짙은 분위기",
    "misty": "얇은 안개나 물안개가 있는 분위기",
    "hazy": "먼지나 습기로 시야가 살짝 흐린 공기",
    "rainy": "비 오는 장면",
    "stormy": "폭풍우나 거친 날씨",
    "snowy": "눈 오는 장면",
    "windy": "바람이 강한 장면",
    "dusty": "먼지가 많은 건조한 분위기",
    "smoky": "연기가 깔린 분위기",
    "humid atmosphere": "습기가 느껴지는 무겁고 눅눅한 공기",
    "heavy snowfall": "눈이 많이 내리는 장면",
    "drifting snow": "바람에 흩날리는 눈",
    "falling rain": "떨어지는 빗줄기",
    "drifting embers": "날리는 불씨",
    "floating dust": "공중에 떠다니는 먼지",
    "sea spray": "파도나 바닷바람의 물보라",
    "heat haze": "더운 공기 때문에 일렁이는 아지랑이"
  },

  "공간과_스케일": {
    "vast open space": "넓고 트인 공간",
    "enclosed interior": "닫힌 실내 공간",
    "cramped space": "좁고 답답한 공간",
    "cavernous space": "동굴처럼 크고 깊은 공간",
    "narrow corridor": "좁은 복도",
    "layered environment": "여러 층위가 있는 풍부한 배경",
    "dense urban setting": "건물과 사람이 빽빽한 도시 환경",
    "quiet rural setting": "조용한 시골 환경",
    "wilderness": "인간 손길이 적은 야생 자연",
    "industrial interior": "공장, 기계실 같은 산업적 실내",
    "domestic interior": "집 안, 생활 공간",
    "grand architecture": "웅장한 건축물",
    "ruined architecture": "폐허가 된 건축물",
    "cluttered environment": "물건이 많고 복잡한 환경",
    "minimalist environment": "간결하고 절제된 환경",
    "lived-in environment": "사람이 실제로 살아온 흔적이 있는 공간",
    "monumental scale": "기념비적이고 거대한 규모",
    "intimate scale": "작고 가까운 사적인 규모"
  },

  "시각_스타일": {
    "photorealistic": "사진처럼 사실적인 표현",
    "cinematic realism": "영화 장면처럼 현실적이지만 연출된 표현",
    "documentary photography": "다큐멘터리 사진처럼 현장감 있는 표현",
    "editorial photography": "잡지 화보 같은 세련된 사진 스타일",
    "film still": "영화의 한 프레임처럼 보이는 이미지",
    "fantasy illustration": "판타지 소설 표지나 게임 아트 같은 스타일",
    "graphic novel art": "그래픽 노블식 진지하고 서사적인 만화 스타일",
    "anime": "일본 애니메이션풍",
    "storybook illustration": "동화책 삽화 같은 부드러운 스타일",
    "minimalist illustration": "단순하고 절제된 형태 중심의 일러스트",
    "impressionist painting": "빛과 색의 인상을 강조하는 인상주의풍",
    "expressionist painting": "감정과 왜곡을 강하게 드러내는 표현주의풍",
  },

  "매체와_표현_기법": {
    "ink wash": "먹 번짐과 농담이 있는 동양화적 표현",
    "graphite drawing": "연필 드로잉 같은 세밀한 흑연 질감",
    "screen print": "실크스크린처럼 색면이 또렷한 인쇄 느낌",
    "collage": "여러 재료를 붙여 만든 콜라주 느낌",
    "paper cutout": "종이를 오려 붙인 듯한 레이어 표현",
    "3D render": "3D 그래픽 렌더링 느낌",
    "pixel art": "픽셀 단위로 구성된 레트로 게임풍",
  },

  "광학효과와_후처리": {
    "fine film grain": "필름 사진의 미세한 입자감",
    "halation": "밝은 부분 주변이 부드럽게 번지는 필름 효과",
    "bloom": "강한 빛이 주변으로 번지는 효과",
    "lens flare": "렌즈 안에서 빛이 반사되어 생기는 플레어",
    "anamorphic flare": "가로로 길게 뻗는 영화적 렌즈 플레어",
    "light leaks": "필름 카메라에 빛이 새어 들어온 듯한 효과",
    "chromatic aberration": "렌즈 가장자리의 색 번짐 효과",
    "vignette": "화면 가장자리가 어두워지는 효과",
    "soft glow": "전체적으로 부드러운 빛 번짐",
    "starburst effect": "빛이 별 모양으로 갈라지는 효과",
    "bokeh highlights": "흐린 배경 속 반짝이는 빛망울",
    "subtle haze": "얇은 안개나 공기층이 낀 듯한 효과",
    "double exposure": "두 이미지가 겹친 듯한 사진 효과",
  },

  "품질과_디테일": {
    "highly detailed": "디테일이 풍부하도록 유도",
    "intricate details": "복잡하고 정교한 세부 요소 강조",
    "fine details": "작고 섬세한 디테일 강조",
    "crisp textures": "질감이 선명하고 또렷하게 보이도록 유도",
    "sharp focus": "초점이 선명한 이미지",
    "clean rendering": "지저분한 노이즈나 흐트러짐이 적은 깔끔한 렌더링",
    "polished finish": "완성도가 높은 마감 느낌",
    "refined composition": "정제되고 세련된 구도",
    "coherent composition": "장면 요소들이 서로 어색하지 않게 맞물린 구도",
    "accurate perspective": "원근과 공간감이 자연스럽도록 유도",
    "natural proportions": "인체나 사물 비율이 자연스럽도록 유도",
    "realistic materials": "재질 표현이 현실적으로 보이도록 유도",
    "high visual fidelity": "전체적인 시각적 완성도와 선명도 향상",
    "professional photography": "전문 사진 촬영 같은 품질",
    "production-quality concept art": "실제 제작용 콘셉트 아트 같은 완성도",
    "cinematic detail": "영화 장면처럼 디테일과 연출감이 있는 표현",
    "detailed environment": "배경과 공간 디테일을 풍부하게 유도"
  },
}