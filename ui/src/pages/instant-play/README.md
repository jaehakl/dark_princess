기존 play 페이지와 별개로 instant-play 페이지라는 걸 만든다.


<레이아웃 구성>
- 이미지(background) + Script 표시
- 다음 Scene 요구사항 입력 + 제출 버튼


<페이지 데이터>
- context
- script
- script_jp
- audio 
- image 


<동작 흐름>
1. 다음 Scene 요구사항 입력 + 제출
2. 기존 context + 기존 script + 다음 Scene 요구사항 => 다음 장면 script 생성 (api_ask_llm )
3. 기존 context + 기존 script => 다음 context 로 다시 요약 (길이는 기존 context 와 같게, 즉, 점진적으로 압축되도록)
4. script 를 script_jp 로 번역 (api_ask_llm)
5. script_jp 로 audio 생성 (voicevox api)
6. script 로 image prompt 생성 (api_ask_llm)
7. image prompt embedding 계산 및 embedding 이 가까운 image 를 db 에서 가져옴 (api_get_similar_images)
8. 다음 Scene (image+script 띄우고 audio 재생, context 는 모달을 띄워서 확인 가능) 출력 및 다다음 Scene 요구사항 입력 대기