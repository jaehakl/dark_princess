DB 를 다음과  같이 변경한다.

1. Scene
- prompt
- embedding
- scripts (JSON)
- status_change (JSON)

2. SceneOption
- scene_id
- option_text
- embedding

3. Status
- context (vector 1024)
name: Mapped[str] = mapped_column(Text, nullable=False)
turn: Mapped[int] = mapped_column(Integer, nullable=False)
cash: Mapped[int] = mapped_column(Integer, nullable=False)
strength: Mapped[int] = mapped_column(Integer, nullable=False)
agility: Mapped[int] = mapped_column(Integer, nullable=False)
intelligence: Mapped[int] = mapped_column(Integer, nullable=False)
sense: Mapped[int] = mapped_column(Integer, nullable=False)
attractiveness: Mapped[int] = mapped_column(Integer, nullable=False)
toughness: Mapped[int] = mapped_column(Integer, nullable=False)
stress: Mapped[int] = mapped_column(Integer, nullable=False)


Next Scene 결정 함수 
Input : 
- Context : Scene history Embedding (embedding 을 x0.9 하면서 누적 평균) 
- Normalized Status
- Scene Option Embedding


Output : 
- target Scene embedding (mutation, reroll)