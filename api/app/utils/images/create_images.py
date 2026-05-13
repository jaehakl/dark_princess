from typing import List, Dict, Any, Optional
import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc, asc
from models import ImageData, ImageRequestData
from db import Path, Image
import random
from utils.embedding import get_text_embedding
from utils.stable_diffusion import generate_images_multi_gpu_async, generate_images_from_image_multi_gpu_async
import json, uuid
import os, shutil
from settings import settings
from PIL import Image as PILImage


async def create_image_batch_from_image(image_request_data: ImageRequestData, uploaded_files: List[Any], db: Session) -> List[ImageData]:
    created_images = []
    embedding_list = []
    images_list_total = []
    seed_list_total = []

    image_file_list = []
    image_to_image_mode = False
    ir = image_request_data

    if ir:
        for positive_prompt in ir.positive_prompt_list:
            embedding_list.append(await asyncio.to_thread(get_text_embedding, positive_prompt))

        # 업로드된 파일이 있으면 사용
        if uploaded_files and len(uploaded_files) > 0:
            image_to_image_mode = True
            temp_path_list = []
            for uploaded_file in uploaded_files:
                # 업로드된 파일을 임시로 저장
                temp_path = f"temp_{uuid.uuid4().hex}_{uploaded_file.filename}"
                with open(temp_path, "wb") as buffer:
                    content = await uploaded_file.read()
                    buffer.write(content)     
                    temp_path_list.append(temp_path)
            for i in range(len(ir.positive_prompt_list)):
                image_file_list.append(temp_path_list[i%len(temp_path_list)])
        elif ir.images and len(ir.images) == len(ir.positive_prompt_list):
            image_to_image_mode = True
            images = db.query(Image).filter(Image.id.in_(ir.images)).all()
            image_file_map = {}
            for image in images:
                image_file_map[image.id] = image.url
            for image_id in ir.images:
                if image_id not in image_file_map:
                    raise ValueError(f"Image file not found: {image_id}")
                image_file_list.append(image_file_map[image_id])

        if image_to_image_mode:
            # 멀티 GPU 지원으로 이미지 생성
            images_list, generators_chunk = await generate_images_from_image_multi_gpu_async(
                                            ckpt_path=ir.ckpt_path,
                                            positive_prompt_list=ir.positive_prompt_list, 
                                            negative_prompt_list=ir.negative_prompt_list,
                                            seed_list=ir.seed_list,
                                            image_list=image_file_list,
                                            strength=ir.strength,
                                            step=ir.steps, 
                                            cfg=ir.cfg, 
                                            height=ir.height, 
                                            width=ir.width,
                                            max_chunk_size=ir.max_chunk_size)
            images_list_total.extend(images_list)
            seed_list_total.extend(generators_chunk)

        else:
            images_list, generators_chunk = await generate_images_multi_gpu_async(
                                            ckpt_path=ir.ckpt_path, 
                                            positive_prompt_list=ir.positive_prompt_list, 
                                            negative_prompt_list=ir.negative_prompt_list,
                                            seed_list=ir.seed_list,
                                            step=ir.steps, 
                                            cfg=ir.cfg, 
                                            height=ir.height, 
                                            width=ir.width,
                                            max_chunk_size=ir.max_chunk_size)
            images_list_total.extend(images_list)
            seed_list_total.extend(generators_chunk)

        for i, image_file in enumerate(images_list_total):
            image_id = str(uuid.uuid4().hex)
            url = f"figures/{image_id}.jpg"
            await asyncio.to_thread(image_file.save, url, format="JPEG", quality=85)

            image = Image(
                id=image_id,
                positive_prompt=ir.positive_prompt_list[i],
                negative_prompt=ir.negative_prompt_list[i],
                model=ir.ckpt_path,
                steps=int(ir.steps),
                cfg=float(ir.cfg),
                height=int(ir.height),
                width=int(ir.width),
                seed=int(seed_list_total[i]),
                embedding=embedding_list[i],
                url=url,
            )
            db.add(image)
            db.flush()

            path = Path(
                image_id=image.id,
                path=ir.path + image.id,
            )
            db.add(path)
            db.flush()

            created_images.append(ImageData(
                id=image.id,
                positive_prompt=image.positive_prompt,
                negative_prompt=image.negative_prompt,
                model=image.model,
                steps=image.steps,
                cfg=image.cfg,
                height=image.height,
                width=image.width,
                seed=image.seed,
                url=image.url,
                keywords=[],
            ))

        db.commit()
        
        # 임시 파일들 정리
        for temp_file in image_file_list:
            if temp_file.startswith("temp_"):
                try:
                    os.remove(temp_file)
                except:
                    pass  # 파일 삭제 실패해도 무시
    
    return created_images