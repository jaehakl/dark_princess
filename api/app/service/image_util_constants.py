GEN_IMAGE_POSITIVE_BASE = "masterpiece, best quality"
GEN_IMAGE_NEGATIVE_PROMPT = "low quality, blurry, jpeg artifacts, watermark, signature, text, logo, distorted, deformed face"

GEN_IMAGE_CAMERA_SAMPLES = {
  "카메라_거리_쇼트크기": ["extreme close-up", "close-up", "medium close-up", "medium shot", "medium full shot", "cowboy shot", "full shot", "full-body shot", "long shot", "wide shot", "extreme wide shot", "establishing shot", "environmental shot", "panoramic shot", "macro shot"],
  "구도": ["centered composition", "rule of thirds", "symmetrical composition", "asymmetrical composition", "balanced composition", "dynamic composition", "diagonal composition", "triangular composition", "radial composition", "layered composition", "leading lines", "S-curve composition", "frame within a frame", "negative space", "foreground framing", "deep composition", "clear focal point", "cinematic composition"],
  "피사체_배치": ["centered subject", "off-center subject", "subject in the foreground", "subject in the midground", "subject in the background", "foreground silhouette", "background figures", "isolated subject", "overlapping figures", "clustered figures", "evenly spaced figures", "foreground and background separation", "small figure in a vast environment", "dominant foreground subject"],
  "인물_수와_관계": ["single figure", "two-shot", "three-person composition", "group shot", "ensemble cast", "crowd scene", "face-to-face", "side-by-side", "back-to-back", "surrounding figures", "interacting characters", "separated characters", "foreground protagonist", "background onlookers"],
  "카메라_각도": ["eye-level shot", "high-angle shot", "low-angle shot", "bird's-eye view", "worm's-eye view", "overhead shot", "top-down view", "ground-level shot", "hip-level shot", "shoulder-level shot", "Dutch angle", "canted angle", "oblique angle"],
  "시점과_방향": ["front view", "side view", "profile view", "three-quarter view", "rear view", "over-the-shoulder shot", "point-of-view shot", "first-person perspective", "aerial viewpoint", "spectator viewpoint", "observer viewpoint", "looking through a doorway", "looking through a window"],
  "렌즈와_화각": ["ultra-wide-angle lens", "wide-angle lens", "14mm lens", "24mm lens", "35mm lens", "50mm lens", "85mm lens", "135mm lens", "telephoto lens", "macro lens", "fisheye lens", "tilt-shift lens", "anamorphic lens"],
  "원근법": ["one-point perspective", "two-point perspective", "three-point perspective", "linear perspective", "atmospheric perspective", "forced perspective", "exaggerated perspective", "compressed perspective", "deep perspective", "isometric view", "orthographic view", "foreshortening"],
  "초점과_심도": ["shallow depth of field", "large depth of field", "deep focus", "selective focus", "tack sharp focus", "soft focus", "sharp foreground", "sharp background", "foreground blur", "background blur", "creamy bokeh", "split-diopter effect"],
  "움직임과_동세": ["dynamic action", "dynamic pose", "frozen motion", "freeze-frame", "motion blur", "long exposure", "panning shot", "zoom blur", "flowing movement", "suspended motion", "windblown fabric", "falling debris", "drifting particles", "splashing water", "subtle gesture", "candid movement"],
  "서사와_장면_유형": ["in medias res", "decisive moment", "before the action", "aftermath", "dramatic confrontation", "quiet interaction", "discovery scene", "escape scene", "chase scene", "ritual scene", "crowd scene", "environmental storytelling", "visual narrative", "cinematic tableau", "narrative illustration", "candid moment", "implied story", "clear cause and effect"],
  "분위기와_감정": ["serene", "peaceful", "cozy", "intimate", "contemplative", "melancholic", "nostalgic", "hopeful", "uplifting", "joyful", "playful", "romantic", "mysterious", "suspenseful", "tense", "ominous", "eerie", "haunting", "solemn", "triumphant", "whimsical", "dreamlike", "surreal", "chaotic", "desolate", "oppressive", "bittersweet"],
  "조명_성질": ["natural light", "soft diffused light", "hard directional light", "ambient light", "bounced light", "practical lighting", "available light", "studio lighting", "cinematic lighting", "soft ambient lighting", "dappled light", "scattered light", "volumetric lighting", "light shafts", "god rays", "caustic lighting"],
  "조명_방향과_패턴": ["front lighting", "side lighting", "backlighting", "rim lighting", "top lighting", "underlighting", "three-quarter lighting", "split lighting", "Rembrandt lighting", "butterfly lighting", "loop lighting", "silhouette lighting"],
  "광원과_시간대": ["dawn light", "early morning light", "midday sunlight", "golden hour", "sunset light", "blue hour", "twilight", "moonlight", "starlight", "window light", "candlelight", "firelight", "torchlight", "neon light", "fluorescent light", "streetlight", "bioluminescent light"],
  "명암과_대비": ["high-key lighting", "low-key lighting", "high contrast", "low contrast", "chiaroscuro", "dramatic shadows", "soft shadows", "hard shadows", "deep shadows", "lifted shadows", "bright highlights", "silhouette", "contre-jour"],
  "색상_팔레트": ["warm color palette", "cool color palette", "neutral color palette", "muted colors", "desaturated colors", "saturated colors", "vibrant colors", "pastel palette", "earth tones", "jewel tones", "monochromatic palette", "analogous colors", "complementary colors", "split-complementary palette", "limited color palette", "black and white", "sepia tones", "teal and orange"],
  "색보정과_톤": ["cinematic color grading", "filmic color grading", "natural color grading", "warm color grade", "cool color grade", "vintage color grading", "faded film look", "bleach bypass", "cross-processed colors", "crushed blacks", "lifted blacks", "soft highlight roll-off", "high dynamic range"],
  "날씨와_대기": ["clear atmosphere", "overcast sky", "cloudy", "foggy", "misty", "hazy", "rainy", "stormy", "snowy", "windy", "dusty", "smoky", "humid atmosphere", "heavy snowfall", "drifting snow", "falling rain", "drifting embers", "floating dust", "sea spray", "heat haze"],
  "공간과_스케일": ["vast open space", "enclosed interior", "cramped space", "cavernous space", "narrow corridor", "layered environment", "quiet rural setting", "wilderness", "industrial interior", "domestic interior", "grand architecture", "ruined architecture", "cluttered environment", "minimalist environment", "lived-in environment", "monumental scale", "intimate scale"],
  "시대와_장르": ["contemporary realism", "historical drama", "period piece", "fantasy", "dark fantasy", "science fiction", "space opera", "cyberpunk", "solarpunk", "steampunk", "retrofuturism", "post-apocalyptic", "gothic", "noir", "western", "folklore", "mythic", "surreal fantasy"],
  "시각_스타일": ["photorealistic", "cinematic realism", "documentary photography", "editorial photography", "fine art photography", "film still", "concept art", "matte painting", "digital painting", "painterly illustration", "fantasy illustration", "graphic novel art", "comic book art", "anime", "manga", "storybook illustration", "minimalist illustration", "surrealist art", "impressionist painting", "expressionist painting", "art nouveau", "art deco"],
  "매체와_표현_기법": ["oil painting", "watercolor", "gouache", "acrylic painting", "ink wash", "pen and ink", "charcoal drawing", "graphite drawing", "pastel drawing", "colored pencil", "linocut print", "woodblock print", "screen print", "collage", "mixed media", "paper cutout", "stained glass", "mosaic", "3D render", "claymation", "stop-motion look", "pixel art", "low-poly 3D"],
  "재질과_표면": ["realistic skin texture", "rough stone", "weathered wood", "brushed metal", "polished metal", "translucent glass", "reflective surfaces", "matte surfaces", "glossy surfaces", "wet surfaces", "dusty surfaces", "worn fabric", "intricate fabric texture", "tactile textures", "organic textures", "layered textures", "fine surface detail"],
  "광학효과와_후처리": ["fine film grain", "halation", "bloom", "lens flare", "anamorphic flare", "light leaks", "chromatic aberration", "vignette", "soft glow", "starburst effect", "bokeh highlights", "subtle haze", "double exposure", "infrared look"],
  "품질과_디테일": ["highly detailed", "intricate details", "fine details", "crisp textures", "sharp focus", "clean rendering", "polished finish", "refined composition", "coherent composition", "accurate perspective", "natural proportions", "realistic materials", "high visual fidelity", "professional photography", "production-quality concept art", "cinematic detail", "detailed environment"],
  "화면비와_방향": ["horizontal composition", "vertical composition", "square composition", "panoramic composition", "widescreen composition", "cinematic 16:9 framing", "anamorphic widescreen", "landscape orientation", "portrait orientation", "tall composition"]
}

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
