from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from db import Base, engine

from settings import settings


async def column_exists(conn, table_name, column_name):
    if engine.dialect.name == "postgresql":
        escaped_table_name = table_name.replace("'", "''")
        escaped_column_name = column_name.replace("'", "''")
        result = await conn.exec_driver_sql(
            "SELECT 1 FROM information_schema.columns "
            f"WHERE table_name = '{escaped_table_name}' "
            f"AND column_name = '{escaped_column_name}';"
        )
        return result.first() is not None

    if engine.dialect.name == "sqlite":
        columns = await conn.exec_driver_sql(f"PRAGMA table_info({table_name});")
        return column_name in {row[1] for row in columns}

    return False


async def add_target_prompt_column(conn):
    if engine.dialect.name == "postgresql":
        await conn.exec_driver_sql("ALTER TABLE targets ADD COLUMN IF NOT EXISTS prompt TEXT;")
        return

    if engine.dialect.name == "sqlite" and not await column_exists(conn, "targets", "prompt"):
        await conn.exec_driver_sql("ALTER TABLE targets ADD COLUMN prompt TEXT;")


async def add_scene_trigger_block_chance_percent_column(conn):
    if engine.dialect.name == "postgresql":
        await conn.exec_driver_sql(
            "ALTER TABLE scene_trigger_blocks "
            "ADD COLUMN IF NOT EXISTS chance_percent INTEGER NOT NULL DEFAULT 100;"
        )
        return

    if engine.dialect.name == "sqlite" and not await column_exists(
        conn, "scene_trigger_blocks", "chance_percent"
    ):
        await conn.exec_driver_sql(
            "ALTER TABLE scene_trigger_blocks "
            "ADD COLUMN chance_percent INTEGER NOT NULL DEFAULT 100;"
        )


async def normalize_scene_repeat_policy_values(conn):
    await conn.exec_driver_sql(
        "UPDATE scenes SET repeat_policy = 'once_per_status' "
        "WHERE repeat_policy = 'once_per_turn';"
    )


async def migrate_option_chosen_conditions(conn):
    if not await column_exists(conn, "scene_conditions", "option_ref_id"):
        return

    await conn.exec_driver_sql(
        """
        UPDATE scene_options
        SET next_scene_id = (
            SELECT scene_trigger_blocks.scene_id
            FROM scene_conditions
            JOIN scene_trigger_blocks
              ON scene_trigger_blocks.id = scene_conditions.trigger_block_id
            WHERE scene_conditions.kind = 'option_chosen'
              AND scene_conditions.option_ref_id = scene_options.id
            ORDER BY scene_conditions.sort_order, scene_conditions.id
            LIMIT 1
        )
        WHERE next_scene_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM scene_conditions
            JOIN scene_trigger_blocks
              ON scene_trigger_blocks.id = scene_conditions.trigger_block_id
            WHERE scene_conditions.kind = 'option_chosen'
              AND scene_conditions.option_ref_id = scene_options.id
          );
        """
    )
    await conn.exec_driver_sql(
        """
        DELETE FROM scene_trigger_blocks
        WHERE id IN (
            SELECT scene_trigger_blocks.id
            FROM scene_trigger_blocks
            WHERE EXISTS (
                SELECT 1
                FROM scene_conditions
                WHERE scene_conditions.trigger_block_id = scene_trigger_blocks.id
                  AND scene_conditions.kind = 'option_chosen'
            )
              AND NOT EXISTS (
                SELECT 1
                FROM scene_conditions
                WHERE scene_conditions.trigger_block_id = scene_trigger_blocks.id
                  AND scene_conditions.kind <> 'option_chosen'
            )
        );
        """
    )
    await conn.exec_driver_sql("DELETE FROM scene_conditions WHERE kind = 'option_chosen';")
    await conn.exec_driver_sql("DROP INDEX IF EXISTS ix_scene_conditions_option_ref_id;")

    if engine.dialect.name == "postgresql":
        await conn.exec_driver_sql(
            "ALTER TABLE scene_conditions DROP COLUMN IF EXISTS option_ref_id;"
        )
        return

    if engine.dialect.name != "sqlite":
        return

    await conn.exec_driver_sql("DROP TABLE IF EXISTS scene_conditions_migration;")
    await conn.exec_driver_sql(
        """
        CREATE TABLE scene_conditions_migration (
            id INTEGER NOT NULL,
            trigger_block_id INTEGER,
            option_id INTEGER,
            kind TEXT NOT NULL,
            operator TEXT NOT NULL,
            tag_id INTEGER,
            target_id INTEGER,
            scene_ref_id INTEGER,
            stat_field TEXT,
            numeric_value INTEGER,
            value JSON,
            sort_order INTEGER DEFAULT 0 NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            CONSTRAINT pk_scene_conditions PRIMARY KEY (id),
            CONSTRAINT fk_scene_conditions_trigger_block_id_scene_trigger_blocks
                FOREIGN KEY(trigger_block_id) REFERENCES scene_trigger_blocks (id) ON DELETE CASCADE,
            CONSTRAINT fk_scene_conditions_option_id_scene_options
                FOREIGN KEY(option_id) REFERENCES scene_options (id) ON DELETE CASCADE,
            CONSTRAINT fk_scene_conditions_tag_id_tags
                FOREIGN KEY(tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            CONSTRAINT fk_scene_conditions_target_id_targets
                FOREIGN KEY(target_id) REFERENCES targets (id) ON DELETE CASCADE,
            CONSTRAINT fk_scene_conditions_scene_ref_id_scenes
                FOREIGN KEY(scene_ref_id) REFERENCES scenes (id) ON DELETE CASCADE
        );
        """
    )
    await conn.exec_driver_sql(
        """
        INSERT INTO scene_conditions_migration (
            id,
            trigger_block_id,
            option_id,
            kind,
            operator,
            tag_id,
            target_id,
            scene_ref_id,
            stat_field,
            numeric_value,
            value,
            sort_order,
            created_at,
            updated_at
        )
        SELECT
            id,
            trigger_block_id,
            option_id,
            kind,
            operator,
            tag_id,
            target_id,
            scene_ref_id,
            stat_field,
            numeric_value,
            value,
            sort_order,
            created_at,
            updated_at
        FROM scene_conditions;
        """
    )
    await conn.exec_driver_sql("DROP TABLE scene_conditions;")
    await conn.exec_driver_sql(
        "ALTER TABLE scene_conditions_migration RENAME TO scene_conditions;"
    )
    await conn.exec_driver_sql(
        "CREATE INDEX ix_scene_conditions_trigger_block_id "
        "ON scene_conditions (trigger_block_id);"
    )
    await conn.exec_driver_sql(
        "CREATE INDEX ix_scene_conditions_option_id ON scene_conditions (option_id);"
    )
    await conn.exec_driver_sql(
        "CREATE INDEX ix_scene_conditions_kind ON scene_conditions (kind);"
    )
    await conn.exec_driver_sql(
        "CREATE INDEX ix_scene_conditions_tag_id ON scene_conditions (tag_id);"
    )
    await conn.exec_driver_sql(
        "CREATE INDEX ix_scene_conditions_target_id ON scene_conditions (target_id);"
    )
    await conn.exec_driver_sql(
        "CREATE INDEX ix_scene_conditions_scene_ref_id ON scene_conditions (scene_ref_id);"
    )


def server():
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # When service starts.
        await start()
    
        yield
        
        # When service is stopped.
        shutdown()

    app = FastAPI(lifespan=lifespan)

    origins = [
        "http://localhost",
        "http://localhost:5173",
        settings.app_base_url
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=origins,
        #allow_origin_regex="https://.*\.onigiri\.kr",
        allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    upload_dir = Path(settings.LOCAL_UPLOAD_DIR).expanduser().resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    async def start():
        app.state.progress = 0
        async with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                try:
                    await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS citext;")
                    await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                    await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector;")
                except Exception:
                    pass
            await conn.run_sync(Base.metadata.create_all)
            await add_target_prompt_column(conn)
            await add_scene_trigger_block_chance_percent_column(conn)
            await normalize_scene_repeat_policy_values(conn)
            await migrate_option_chosen_conditions(conn)

        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
