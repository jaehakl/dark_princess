Scene 이미지 데이터베이스 구조 개편안


1. Image 테이블을 새로 만든다.
- id
- image_object_key (기존 Scene.image_url)
- scribble_object_key (기존 Scene.image_url)
- pose_object_key (기존 Scene.image_url)
- positive_prompt (instant, default 포함하여 실제로 이미지 생성에 들어간 것)
- positive_prompt_embedding
- negative_prompt (instant, default 포함하여 실제로 이미지 생성에 들어간 것)
- seed_image_id (i2i 로 생성된 경우)
- model_parameters (JSON) (위에 저장되는 것 제외 이미지 생성에 필요한 모든 메타정보(모델 파일명, seed, cfg 등등))

2. Scene 테이블의 칼럼들을 변경한다.
- id
- image_id (Image fk)
- embedding
- script
- status_change
- prompt_situation
- prompt_hero
- prompt_camera
- prompt_detail
- prompt_negative

(Scene 테이블의 다음 칼럼들은 모두 제거한다.)
- prompt_situation_embedding
- prompt_hero_embedding
- prompt_camera_embedding
- prompt_detail_embedding


<이미지 생성 흐름>
- 이미지 생성 시, parent image_id 를 프론트로부터 받을 수 있음 (nullable)
- 이미지 생성 후 Image 테이블에 저장 후 scene 에는 image_id 연결
- 실제 i2i 및 inpaint 이미지 생성에는 기존처럼 image blob 받아서 사용, parent image_id 는 Image 테이블에 값으로만 저장
- 이미지 재생성 시, 기존 Image 는 삭제하지 않으며, Scene 에 연결된 image_id 만 교체
