


프롬프트 체계 개편안

<요약>
- 저장되지 않는 instant prompt 를 넣을 수 있게 한다
- 칼럼 종류들의 재편
- negative 프롬프트도 저장할 수 있게 함


<작업할 내용>
- db.py (Scene 테이블 수정)
- initserver.py (부팅시 마이그레이션용 코드 추가)
- service/scene.py (이미지 생성 시 프롬프트 종류별 결합 및 저장 로직)
- SceneEditComponent.tsx (편집 대상 프롬프트 변경)
- 그 밖에 영향받는 코드들


<이미지 생성 시 결합 순서>

(positive)
1. prompt_situation
2. prompt_instant_positive
3. prompt_hero
4. prompt_camera 
5. prompt_detail
6. prompt_default_positive

(negative)
1. prompt_instant_negative
1. prompt_negative
2. prompt_default_negative


<입력 및 관리>

(DB 테이블 칼럼, 저장)
1. prompt_situation
2. prompt_hero
3. prompt_camera 
4. prompt_detail
5. prompt_negative

(SceneEditComponent 에서 편집)
1. prompt_situation
2. prompt_instant_positive
3. prompt_hero
4. prompt_camera 
5. prompt_detail
6. prompt_instant_negative
7. prompt_negative

(이미지 설정에서 편집 및 Session Storage 저장)
1. prompt_default_positive
2. prompt_default_negative