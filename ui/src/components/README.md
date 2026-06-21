Image 관리 화면

- 전체 Image 목록을 본다.
    * pagenation
    * sort (참조된 Cut 수, id 순 등)
    * family 별 모아보기
- Image 를 일괄 선택 후 삭제할 수 있다.
- 프롬프트로 이미지를 검색할 수 있다.
- GEN_IMAGE_CAMERA_SAMPLES 를 조회하고 선택할 수 있다.
    * 종류(key 값)들을 1차 chips 목록으로 표시한다.
    * 종류를 선택하면 그 종류의 태그 List 를 2차 chips 목록으로 표시한다.
    * 2차 태그 chip 을 선택하면 검색창에 바로 입력되고 검색까지 한 번 수행한다.


자동 이미지 생성기
- ImageManager 화면에 버튼 배치
- "정지" 를 누를 때 까지 자동으로 다음과 같이 prompt 작성하여 /image/generate 로 계속 생성

다음과 같이 prompt 작성

positive: 다음 6가지를 순서대로 합체
- GEN_IMAGE_CAMERA_SAMPLES 에서 무작위로 프롬프트 1 개 pick
- prompt_situation : Cut 중 무작위로 1개 선택 후 해당 cut situation 전체 (비어 있어도 무관)
- prompt_hero : Cut 중 무작위로 1개 선택 후 해당 cut hero 전체 (비어 있어도 무관)
- prompt_camera : Cut 중 무작위로 1개 선택 후 해당 cut camera 전체 (비어 있어도 무관)
- prompt_detail : Cut 중 무작위로 1개 선택 후 해당 cut detail 전체 (비어 있어도 무관)
- default positive prompt : session storage 설정값

(negative)
- default negative prompt : session storage 설정값


