


Scene 테이블 추가
- id
- title (text)
- context (text)
- context_embedding
- turn (int)
- cash (int)
- strength (int)
- agility (int)
- intelligence (int)
- sence (int)
- attractiveness (int)
- toughness (int)
- stress (int)
- first_cut_id (fk)

Cut 테이블 칼럼 추가
- scene_id (fk)
- prev_cut_id (fk, nullable)



Scene 목록 화면
- Scene 별 first_cut 의 이미지 + title + 포함된 cut 의 수 표시 (grid 로)


Scene 편집기

- 좌측 Scene 정보
    - Scene 정보 편집 모달(title, context, turn~stress 편집 및 저장)
    - Cut 목록(image, script)    
    - 디폴트 : id 순, 선택 시 : 해당 scene 의 직계우선 표시
    - 현재 cut_context 조회 모달 버튼(cut_context = Scene context + 같은 Scene 내 현재 선택된 cut script 들 이어붙이기)
    - 현재 cut 을 first_cut 으로 지정
    - 현재 cut 의 prev_cut 지정
    - 현재 cut 의 next_cut 생성

- 우측 Cut 편집기
    - 기존 cut-editor 재사용



게임 플레이 알고리즘 변경

현재 Scene 의 Context + 