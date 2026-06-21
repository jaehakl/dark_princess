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
  "구도": {
    "close-up": "얼굴이나 특정 사물을 크게 보여 주는 근접 샷",
    "cowboy shot": "허벅지 위까지 잡는 서부극식 인물 샷",
    "centered": "주 피사체를 화면 중앙에 배치해 안정감과 상징성을 주는 구도",
    "face-to-face": "두 인물이 마주 보는 대립, 대화, 친밀감의 구도",
    "side-by-side": "인물들이 나란히 있어 동행, 연대, 비교를 표현",
    "back-to-back": "등을 맞대고 있는 구도, 협력이나 긴장감을 표현",
  },

  "각도": {
    "eye-level shot": "눈높이 시점으로 자연스럽고 현실적인 인상을 줌",
    "high-angle shot": "위에서 내려다봐 피사체를 작고 약하게 보이게 함",
    "low-angle shot": "아래에서 올려다봐 피사체를 강하고 위압적으로 보이게 함",
    "overhead": "정수리 위에서 내려다보는 시점",
    "Dutch angle": "화면을 기울여 불안감이나 혼란을 주는 각도",
  },

  "시점": {
    "side view": "측면에서 보는 시점",
    "profile view": "인물의 옆얼굴을 강조하는 시점",
    "rear view": "뒤에서 바라보는 시점, 미스터리나 여정의 느낌을 줌",
    "first-person perspective": "1인칭 게임이나 체험 장면처럼 보이는 시점",
    "isometric view": "게임 맵이나 설계도처럼 축이 일정한 등각 시점",
    "foreshortening": "몸이나 사물이 카메라를 향해 짧게 압축되어 보이는 효과",
    "fisheye lens": "어안렌즈처럼 휘어진 왜곡과 독특한 공간감을 만듦",
  },

  "빛": {
    "side lighting": "옆에서 비추는 빛, 입체감과 명암이 강해짐",
    "backlighting": "뒤에서 비추는 빛, 실루엣과 윤곽 강조",
    "rim lighting": "피사체 가장자리에 빛 테두리를 만드는 조명",
    "fine film grain": "필름 사진의 미세한 입자감",
    "overcast sky": "흐린 하늘, 부드럽고 평평한 빛",
    "blue hour": "해가 진 직후의 푸른 시간대",
    "candlelight": "촛불의 따뜻하고 흔들리는 빛",
    "neon light": "강렬한 색의 네온 조명",
    "fluorescent light": "형광등 같은 차갑고 평평한 실내 조명",
  },

  "색조": {
    "warm color palette": "빨강, 주황, 노랑 계열의 따뜻한 색감",
    "cool color palette": "파랑, 청록, 보라 계열의 차가운 색감",
    "analogous colors": "색상환에서 가까운 색끼리 조합한 조화로운 팔레트",
    "complementary colors": "보색 대비를 이용한 강한 색 조합",
    "sepia tones": "갈색빛이 도는 오래된 사진 느낌",
  },

  "배경": {
    "industrial interior": "공장, 기계실 같은 산업적 실내",
    "domestic interior": "집 안, 생활 공간",
    "grand architecture": "웅장한 건축물",
    "ruined architecture": "폐허가 된 건축물",
    "drifting embers": "날리는 불씨",
  },

  "스타일": {
    "narrative illustration": "이야기 전달을 목적으로 한 일러스트",
    "photorealistic": "사진처럼 사실적인 표현",
    "cinematic": "영화 장면처럼 인물, 배경, 빛, 시선 흐름, 디테일과 연출감 표현",
    "film still": "영화의 한 프레임처럼 보이는 이미지",
    "collage": "여러 재료를 붙여 만든 콜라주 느낌",
    "3D render": "3D 그래픽 렌더링 느낌",
  },
}