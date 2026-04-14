"""导入导出服务"""
import copy
import json
import uuid
from datetime import datetime
from types import UnionType
from typing import Dict, List, Optional, Tuple, Any, Literal, Union, get_args, get_origin
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, delete
from pydantic import BaseModel, ConfigDict, ValidationError
from app.models.project import Project
from app.models.chapter import Chapter
from app.models.character import Character
from app.models.outline import Outline
from app.models.relationship import CharacterRelationship, Organization, OrganizationMember
from app.models.writing_style import WritingStyle
from app.models.generation_history import GenerationHistory
from app.models.career import Career, CharacterCareer
from app.models.memory import StoryMemory, PlotAnalysis
from app.models.analysis_task import AnalysisTask
from app.models.batch_generation_task import BatchGenerationTask
from app.models.foreshadow import Foreshadow
from app.models.project_default_style import ProjectDefaultStyle
from app.schemas.import_export import (
    ProjectExportData,
    ChapterExportData,
    CharacterExportData,
    OutlineExportData,
    RelationshipExportData,
    OrganizationExportData,
    OrganizationMemberExportData,
    WritingStyleExportData,
    GenerationHistoryExportData,
    CareerExportData,
    CharacterCareerExportData,
    StoryMemoryExportData,
    PlotAnalysisExportData,
    ForeshadowExportData,
    ProjectDefaultStyleExportData,
    ImportValidationResult,
    ImportResult
)
from app.schemas.career import CareerStage
from app.services.memory_service import memory_service
from app.logger import get_logger

logger = get_logger(__name__)


TOP_LEVEL_ORDER = [
    "project",
    "chapters",
    "characters",
    "outlines",
    "relationships",
    "organizations",
    "organization_members",
    "writing_styles",
    "generation_history",
    "careers",
    "character_careers",
    "story_memories",
    "plot_analysis",
    "foreshadows",
    "project_default_style",
]
TOP_LEVEL_FIELD_DEFAULTS = {
    "version": "1.2.0",
    "export_time": "",
    "source_project_id": "",
}
PROJECT_FIELD_DEFAULTS = {
    "title": "",
    "description": "",
    "theme": "",
    "genre": "",
    "target_words": 0,
    "current_words": 0,
    "status": "",
    "world_time_period": "",
    "world_location": "",
    "world_atmosphere": "",
    "world_rules": "",
    "chapter_count": 0,
    "narrative_perspective": "",
    "character_count": 0,
    "outline_mode": "",
    "user_id": "",
    "created_at": "",
}
SINGLE_RECORD_SECTIONS = {"project", "project_default_style"}
JSON_STRING_FIELDS = {
    "outlines": {"structure"},
    "careers": {"stages", "attribute_bonuses"},
}


class OutlineStructureCharacterModel(BaseModel):
    name: str
    type: Literal["character", "organization"]

    model_config = ConfigDict(extra="forbid")


class OutlineStructureSceneModel(BaseModel):
    location: str
    characters: list[str]
    purpose: str

    model_config = ConfigDict(extra="forbid")


class OutlineStructureModel(BaseModel):
    title: str
    summary: str
    content: str
    characters: list[OutlineStructureCharacterModel]
    scenes: list[str] | list[OutlineStructureSceneModel]
    key_points: list[str]
    key_events: list[str]
    emotion: str
    goal: str

    model_config = ConfigDict(extra="forbid")


class ImportExportService:
    """导入导出服务类"""
    
    SUPPORTED_VERSIONS = ["1.0.0", "1.1.0", "1.2.0"]  # 支持的版本列表
    CURRENT_VERSION = "1.2.0"  # 当前导出版本
    PROJECT_ALLOWED_FIELDS = list(PROJECT_FIELD_DEFAULTS.keys())
    SECTION_MODEL_MAP = {
        "chapters": ChapterExportData,
        "characters": CharacterExportData,
        "outlines": OutlineExportData,
        "relationships": RelationshipExportData,
        "organizations": OrganizationExportData,
        "organization_members": OrganizationMemberExportData,
        "writing_styles": WritingStyleExportData,
        "generation_history": GenerationHistoryExportData,
        "careers": CareerExportData,
        "character_careers": CharacterCareerExportData,
        "story_memories": StoryMemoryExportData,
        "plot_analysis": PlotAnalysisExportData,
        "foreshadows": ForeshadowExportData,
        "project_default_style": ProjectDefaultStyleExportData,
    }

    @staticmethod
    def _unwrap_optional(annotation: Any) -> Any:
        origin = get_origin(annotation)
        if origin is None:
            return annotation
        if origin not in (Union, UnionType):
            return annotation
        args = [arg for arg in get_args(annotation) if arg is not type(None)]
        if len(args) == 1:
            return args[0]
        return annotation

    @staticmethod
    def _default_for_annotation(annotation: Any) -> Any:
        annotation = ImportExportService._unwrap_optional(annotation)
        origin = get_origin(annotation)

        if origin in (list, tuple, set, frozenset):
            return []
        if origin is dict:
            return {}
        if annotation is str:
            return ""
        if annotation is int:
            return 0
        if annotation is float:
            return 0.0
        if annotation is bool:
            return False
        return ""

    @staticmethod
    def _default_for_model_field(field: Any) -> Any:
        if field.default_factory is not None:
            return field.default_factory()
        if field.default is not None and str(field.default) != "PydanticUndefined":
            return copy.deepcopy(field.default)
        return ImportExportService._default_for_annotation(field.annotation)

    @staticmethod
    def _normalize_value_for_annotation(annotation: Any, value: Any) -> Any:
        annotation = ImportExportService._unwrap_optional(annotation)
        origin = get_origin(annotation)

        if value is None:
            return ImportExportService._default_for_annotation(annotation)

        if origin in (list, tuple, set, frozenset):
            if value == "":
                return []
            if isinstance(value, list):
                return value
            if isinstance(value, str):
                stripped = value.strip()
                if not stripped:
                    return []
                try:
                    parsed = json.loads(stripped)
                    return parsed if isinstance(parsed, list) else []
                except json.JSONDecodeError:
                    return [item.strip() for item in value.split(",") if item.strip()]
            return []

        if origin is dict:
            if value == "":
                return {}
            if isinstance(value, dict):
                return value
            if isinstance(value, str):
                stripped = value.strip()
                if not stripped:
                    return {}
                try:
                    parsed = json.loads(stripped)
                    return parsed if isinstance(parsed, dict) else {}
                except json.JSONDecodeError:
                    return {}
            return {}

        if annotation is str:
            return "" if value is None else str(value)
        if annotation is int:
            try:
                return int(value)
            except (TypeError, ValueError):
                return 0
        if annotation is float:
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0
        if annotation is bool:
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.strip().lower() in {"1", "true", "yes", "on"}
            return bool(value)

        return value

    @staticmethod
    def _normalize_outline_structure_value(value: Any) -> tuple[str, list[str]]:
        errors: list[str] = []
        default_structure = {
            "title": "",
            "summary": "",
            "content": "",
            "characters": [],
            "scenes": [],
            "key_points": [],
            "key_events": [],
            "emotion": "",
            "goal": "",
        }

        if value in (None, ""):
            return json.dumps(default_structure, ensure_ascii=False), errors

        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError as exc:
                return json.dumps(default_structure, ensure_ascii=False), [f"outlines.structure: invalid JSON string ({exc.msg})"]
        elif isinstance(value, dict):
            parsed = value
        else:
            return json.dumps(default_structure, ensure_ascii=False), ["outlines.structure: expected JSON string or object"]

        if not isinstance(parsed, dict):
            return json.dumps(default_structure, ensure_ascii=False), ["outlines.structure: expected JSON object"]

        extra_keys = sorted(set(parsed.keys()) - set(default_structure.keys()))
        for key in extra_keys:
            errors.append(f"outlines.structure.{key}: extra field is not allowed")

        merged = {**default_structure}
        for key in default_structure:
            merged[key] = parsed.get(key, default_structure[key])

        try:
            if isinstance(merged.get("characters"), list):
                normalized_characters = []
                for item in merged["characters"]:
                    if isinstance(item, dict):
                        normalized_characters.append(
                            {
                                "name": str(item.get("name", "")),
                                "type": "organization" if str(item.get("type", "")) == "organization" else "character",
                            }
                        )
                merged["characters"] = normalized_characters
            else:
                merged["characters"] = []

            if isinstance(merged.get("scenes"), list):
                normalized_scenes = []
                has_object_scene = any(isinstance(item, dict) for item in merged["scenes"])
                for item in merged["scenes"]:
                    if has_object_scene:
                        if isinstance(item, dict):
                            normalized_scenes.append(
                                {
                                    "location": str(item.get("location", "")),
                                    "characters": [str(char) for char in item.get("characters", []) if str(char)],
                                    "purpose": str(item.get("purpose", "")),
                                }
                            )
                    else:
                        normalized_scenes.append(str(item))
                merged["scenes"] = normalized_scenes
            else:
                merged["scenes"] = []

            for key in ("key_points", "key_events"):
                if isinstance(merged.get(key), list):
                    merged[key] = [str(item) for item in merged[key]]
                else:
                    merged[key] = []

            for key in ("title", "summary", "content", "emotion", "goal"):
                merged[key] = str(merged.get(key, ""))

            OutlineStructureModel.model_validate(merged)
        except ValidationError as exc:
            for issue in exc.errors():
                location = ".".join(str(item) for item in issue.get("loc", ()))
                errors.append(f"outlines.structure.{location}: {issue.get('msg', 'validation error')}" if location else f"outlines.structure: {issue.get('msg', 'validation error')}")

        return json.dumps(merged, ensure_ascii=False), errors

    @staticmethod
    def _normalize_json_string_field(section: str, field_name: str, value: Any) -> tuple[str, list[str]]:
        if section == "outlines" and field_name == "structure":
            return ImportExportService._normalize_outline_structure_value(value)

        if section == "careers" and field_name == "stages":
            errors: list[str] = []
            if value in (None, ""):
                return "[]", errors
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                except json.JSONDecodeError as exc:
                    return "[]", [f"careers.stages: invalid JSON string ({exc.msg})"]
            else:
                parsed = value
            if not isinstance(parsed, list):
                return "[]", ["careers.stages: expected JSON array"]
            normalized_items = []
            for item in parsed:
                if not isinstance(item, dict):
                    errors.append("careers.stages: expected array<object>")
                    continue
                normalized_stage = {
                    "level": int(item.get("level", 0) or 0),
                    "name": str(item.get("name", "")),
                    "description": item.get("description"),
                }
                try:
                    CareerStage.model_validate(normalized_stage)
                except ValidationError as exc:
                    for issue in exc.errors():
                        location = ".".join(str(part) for part in issue.get("loc", ()))
                        errors.append(f"careers.stages.{location}: {issue.get('msg', 'validation error')}" if location else f"careers.stages: {issue.get('msg', 'validation error')}")
                normalized_items.append(normalized_stage)
            return json.dumps(normalized_items, ensure_ascii=False), errors

        if section == "careers" and field_name == "attribute_bonuses":
            errors: list[str] = []
            if value in (None, ""):
                return "{}", errors
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                except json.JSONDecodeError as exc:
                    return "{}", [f"careers.attribute_bonuses: invalid JSON string ({exc.msg})"]
            else:
                parsed = value
            if not isinstance(parsed, dict):
                return "{}", ["careers.attribute_bonuses: expected JSON object"]
            normalized_dict = {str(key): str(item) for key, item in parsed.items()}
            return json.dumps(normalized_dict, ensure_ascii=False), errors

        return str(value or ""), []

    @staticmethod
    def normalize_import_data(data: Dict[str, Any]) -> tuple[Dict[str, Any], list[str]]:
        errors: list[str] = []
        normalized: Dict[str, Any] = {}

        allowed_top_level = set(TOP_LEVEL_FIELD_DEFAULTS.keys()) | set(TOP_LEVEL_ORDER)
        extra_top_level = sorted(set(data.keys()) - allowed_top_level)
        for key in extra_top_level:
            errors.append(f"{key}: extra top-level field is not allowed")

        for key, default_value in TOP_LEVEL_FIELD_DEFAULTS.items():
            normalized[key] = copy.deepcopy(data.get(key, default_value))

        project = data.get("project") or {}
        extra_project = sorted(set(project.keys()) - set(ImportExportService.PROJECT_ALLOWED_FIELDS))
        for key in extra_project:
            errors.append(f"project.{key}: extra field is not allowed")
        normalized["project"] = {
            key: copy.deepcopy(project.get(key, PROJECT_FIELD_DEFAULTS[key]))
            for key in ImportExportService.PROJECT_ALLOWED_FIELDS
        }

        for section in TOP_LEVEL_ORDER:
            if section == "project":
                continue
            model = ImportExportService.SECTION_MODEL_MAP[section]
            source_value = data.get(section)

            if section in SINGLE_RECORD_SECTIONS:
                if source_value is None and section != "project":
                    normalized[section] = None
                    continue
                source_record = source_value or {}
                if source_value is None:
                    source_record = {}
                if not isinstance(source_record, dict):
                    source_record = {}
                extra_keys = sorted(set(source_record.keys()) - set(model.model_fields.keys()))
                for key in extra_keys:
                    errors.append(f"{section}.{key}: extra field is not allowed")
                normalized_record: Dict[str, Any] = {}
                for field_name, field in model.model_fields.items():
                    raw_value = copy.deepcopy(source_record.get(field_name)) if field_name in source_record else ImportExportService._default_for_model_field(field)
                    if field_name in JSON_STRING_FIELDS.get(section, set()):
                        normalized_value, field_errors = ImportExportService._normalize_json_string_field(section, field_name, raw_value)
                        normalized_record[field_name] = normalized_value
                        errors.extend(field_errors)
                    else:
                        normalized_record[field_name] = ImportExportService._normalize_value_for_annotation(field.annotation, raw_value)
                normalized[section] = normalized_record
                continue

            if not isinstance(source_value, list):
                source_value = []
            normalized_records: list[Dict[str, Any]] = []
            for index, record in enumerate(source_value):
                record = record if isinstance(record, dict) else {}
                extra_keys = sorted(set(record.keys()) - set(model.model_fields.keys()))
                for key in extra_keys:
                    errors.append(f"{section}[{index}].{key}: extra field is not allowed")
                normalized_record: Dict[str, Any] = {}
                for field_name, field in model.model_fields.items():
                    raw_value = copy.deepcopy(record.get(field_name)) if field_name in record else ImportExportService._default_for_model_field(field)
                    if field_name in JSON_STRING_FIELDS.get(section, set()):
                        normalized_value, field_errors = ImportExportService._normalize_json_string_field(section, field_name, raw_value)
                        normalized_record[field_name] = normalized_value
                        errors.extend(field_errors)
                    else:
                        normalized_record[field_name] = ImportExportService._normalize_value_for_annotation(field.annotation, raw_value)
                normalized_records.append(normalized_record)
            normalized[section] = normalized_records

        return normalized, errors

    @staticmethod
    def _normalize_memory_vector_metadata(
        memory: StoryMemory,
        related_character_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        return {
            "chapter_id": memory.chapter_id,
            "chapter_number": memory.story_timeline,
            "importance_score": memory.importance_score or 0.5,
            "tags": memory.tags or [],
            "title": memory.title or "",
            "is_foreshadow": memory.is_foreshadow or 0,
            "related_characters": related_character_names or [],
        }

    @staticmethod
    async def rebuild_project_memory_index(
        project_id: str,
        user_id: str,
        db: AsyncSession,
    ) -> int:
        chapter_result = await db.execute(
            select(StoryMemory)
            .where(StoryMemory.project_id == project_id)
            .order_by(StoryMemory.story_timeline, StoryMemory.chapter_position, StoryMemory.created_at)
        )
        memories = chapter_result.scalars().all()
        if not memories:
            return await memory_service.rebuild_project_memories(user_id, project_id, [])

        char_result = await db.execute(
            select(Character).where(Character.project_id == project_id)
        )
        characters = char_result.scalars().all()
        char_mapping = {char.id: char.name for char in characters}

        vector_records: List[Dict[str, Any]] = []
        for memory in memories:
            related_character_names: List[str] = []
            if memory.related_characters:
                related_character_names = [
                    char_mapping.get(char_id, char_id)
                    for char_id in memory.related_characters
                ]

            vector_records.append(
                {
                    "id": memory.vector_id or memory.id,
                    "content": memory.content,
                    "type": memory.memory_type,
                    "metadata": ImportExportService._normalize_memory_vector_metadata(
                        memory,
                        related_character_names=related_character_names,
                    ),
                }
            )

        return await memory_service.rebuild_project_memories(
            user_id=user_id,
            project_id=project_id,
            memories=vector_records,
        )

    @staticmethod
    def _apply_project_fields(target_project: Project, project_data: Dict[str, Any]) -> None:
        """将导入数据应用到项目主记录"""
        target_project.title = project_data.get("title")
        target_project.description = project_data.get("description")
        target_project.theme = project_data.get("theme")
        target_project.genre = project_data.get("genre")
        target_project.target_words = project_data.get("target_words")
        target_project.status = project_data.get("status", "planning")
        target_project.world_time_period = project_data.get("world_time_period")
        target_project.world_location = project_data.get("world_location")
        target_project.world_atmosphere = project_data.get("world_atmosphere")
        target_project.world_rules = project_data.get("world_rules")
        target_project.chapter_count = project_data.get("chapter_count")
        target_project.narrative_perspective = project_data.get("narrative_perspective")
        target_project.character_count = project_data.get("character_count")
        target_project.outline_mode = project_data.get("outline_mode", "one-to-many")
        target_project.current_words = project_data.get("current_words", 0)
        target_project.wizard_step = 4
        target_project.wizard_status = "completed"

    @staticmethod
    async def _clear_project_related_data(
        project_id: str,
        db: AsyncSession,
        user_id: Optional[str] = None
    ) -> None:
        """清空项目关联数据，但保留项目主记录"""
        if user_id:
            try:
                await memory_service.delete_project_memories(user_id, project_id)
                logger.info(f"✅ 同步前已清理项目 {project_id[:8]} 的向量记忆")
            except Exception as exc:
                logger.warning(f"⚠️ 同步前清理向量记忆失败（继续同步）: {exc}")

        relationships_result = await db.execute(
            delete(CharacterRelationship).where(CharacterRelationship.project_id == project_id)
        )
        logger.debug(f"同步清理角色关系数: {relationships_result.rowcount}")

        orgs_result = await db.execute(
            select(Organization).where(Organization.project_id == project_id)
        )
        orgs = orgs_result.scalars().all()
        for org in orgs:
            await db.execute(
                delete(OrganizationMember).where(OrganizationMember.organization_id == org.id)
            )
        await db.execute(delete(Organization).where(Organization.project_id == project_id))

        await db.execute(delete(ProjectDefaultStyle).where(ProjectDefaultStyle.project_id == project_id))
        await db.execute(delete(GenerationHistory).where(GenerationHistory.project_id == project_id))
        await db.execute(delete(AnalysisTask).where(AnalysisTask.project_id == project_id))
        await db.execute(delete(BatchGenerationTask).where(BatchGenerationTask.project_id == project_id))
        await db.execute(delete(PlotAnalysis).where(PlotAnalysis.project_id == project_id))
        await db.execute(delete(StoryMemory).where(StoryMemory.project_id == project_id))

        characters_query = await db.execute(
            select(Character.id).where(Character.project_id == project_id)
        )
        character_ids = [row[0] for row in characters_query.fetchall()]
        if character_ids:
            await db.execute(delete(CharacterCareer).where(CharacterCareer.character_id.in_(character_ids)))

        await db.execute(delete(Career).where(Career.project_id == project_id))
        await db.execute(delete(Chapter).where(Chapter.project_id == project_id))
        await db.execute(delete(Outline).where(Outline.project_id == project_id))
        await db.execute(delete(Character).where(Character.project_id == project_id))
        await db.execute(delete(Foreshadow).where(Foreshadow.project_id == project_id))

    @staticmethod
    async def _import_generation_history(
        project_id: str,
        history_data: List[Dict],
        chapter_mapping: Dict[str, str],
        db: AsyncSession
    ) -> int:
        """导入生成历史"""
        count = 0
        for item in history_data:
            chapter_id = None
            chapter_title = item.get("chapter_title")
            if chapter_title and chapter_title in chapter_mapping:
                chapter_id = chapter_mapping[chapter_title]

            history = GenerationHistory(
                project_id=project_id,
                chapter_id=chapter_id,
                prompt=item.get("prompt"),
                generated_content=item.get("generated_content"),
                model=item.get("model"),
                tokens_used=item.get("tokens_used"),
                generation_time=item.get("generation_time"),
                created_at=ImportExportService._parse_optional_datetime(item.get("created_at")),
            )
            db.add(history)
            count += 1
        return count
    
    @staticmethod
    async def export_project(
        project_id: str,
        db: AsyncSession,
        include_generation_history: bool = False,
        include_writing_styles: bool = True,
        include_careers: bool = True,
        include_memories: bool = False,
        include_plot_analysis: bool = False,
        include_foreshadows: bool = True
    ) -> ProjectExportData:
        """
        导出项目完整数据
        
        Args:
            project_id: 项目ID
            db: 数据库会话
            include_generation_history: 是否包含生成历史
            include_writing_styles: 是否包含写作风格
            include_careers: 是否包含职业系统
            include_memories: 是否包含故事记忆
            include_plot_analysis: 是否包含剧情分析
            include_foreshadows: 是否包含伏笔数据
            
        Returns:
            ProjectExportData: 导出的项目数据
        """
        logger.info(f"开始导出项目: {project_id}")
        
        # 获取项目基本信息
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError(f"项目不存在: {project_id}")
        
        # 项目基本信息
        project_data = {
            "title": project.title,
            "description": project.description,
            "theme": project.theme,
            "genre": project.genre,
            "target_words": project.target_words,
            "current_words": project.current_words,
            "status": project.status,
            "world_time_period": project.world_time_period,
            "world_location": project.world_location,
            "world_atmosphere": project.world_atmosphere,
            "world_rules": project.world_rules,
            "chapter_count": project.chapter_count,
            "narrative_perspective": project.narrative_perspective,
            "character_count": project.character_count,
            "outline_mode": project.outline_mode,
            "user_id": project.user_id,
            "created_at": project.created_at.isoformat() if project.created_at else None,
        }
        
        # 导出章节
        chapters = await ImportExportService._export_chapters(project_id, db)
        logger.info(f"导出章节数: {len(chapters)}")
        
        # 导出角色
        characters = await ImportExportService._export_characters(project_id, db)
        logger.info(f"导出角色数: {len(characters)}")
        
        # 导出大纲
        outlines = await ImportExportService._export_outlines(project_id, db)
        logger.info(f"导出大纲数: {len(outlines)}")
        
        # 导出关系
        relationships = await ImportExportService._export_relationships(project_id, db)
        logger.info(f"导出关系数: {len(relationships)}")
        
        # 导出组织详情
        organizations = await ImportExportService._export_organizations(project_id, db)
        logger.info(f"导出组织数: {len(organizations)}")
        
        # 导出组织成员
        org_members = await ImportExportService._export_organization_members(project_id, db)
        logger.info(f"导出组织成员数: {len(org_members)}")
        
        # 导出写作风格（可选）
        writing_styles = []
        if include_writing_styles:
            writing_styles = await ImportExportService._export_writing_styles(project_id, db)
            logger.info(f"导出写作风格数: {len(writing_styles)}")
        
        # 导出生成历史（可选）
        generation_history = []
        if include_generation_history:
            generation_history = await ImportExportService._export_generation_history(project_id, db)
            logger.info(f"导出生成历史数: {len(generation_history)}")
        
        # 导出职业系统（可选）
        careers = []
        character_careers = []
        if include_careers:
            careers = await ImportExportService._export_careers(project_id, db)
            logger.info(f"导出职业数: {len(careers)}")
            character_careers = await ImportExportService._export_character_careers(project_id, db)
            logger.info(f"导出角色职业关联数: {len(character_careers)}")
        
        # 导出故事记忆（可选）
        story_memories = []
        if include_memories:
            story_memories = await ImportExportService._export_story_memories(project_id, db)
            logger.info(f"导出故事记忆数: {len(story_memories)}")
        
        # 导出剧情分析（可选）
        plot_analysis = []
        if include_plot_analysis:
            plot_analysis = await ImportExportService._export_plot_analysis(project_id, db)
            logger.info(f"导出剧情分析数: {len(plot_analysis)}")

        # 导出伏笔（可选）
        foreshadows = []
        if include_foreshadows:
            foreshadows = await ImportExportService._export_foreshadows(project_id, db)
            logger.info(f"导出伏笔数: {len(foreshadows)}")
        
        # 导出项目默认风格
        project_default_style = await ImportExportService._export_project_default_style(project_id, db)
        if project_default_style:
            logger.info(f"导出项目默认风格: {project_default_style.style_name}")
        
        export_data = ProjectExportData(
            version=ImportExportService.CURRENT_VERSION,
            export_time=datetime.utcnow().isoformat(),
            source_project_id=project.id,
            project=project_data,
            chapters=chapters,
            characters=characters,
            outlines=outlines,
            relationships=relationships,
            organizations=organizations,
            organization_members=org_members,
            writing_styles=writing_styles,
            generation_history=generation_history,
            careers=careers,
            character_careers=character_careers,
            story_memories=story_memories,
            plot_analysis=plot_analysis,
            foreshadows=foreshadows,
            project_default_style=project_default_style
        )

        normalized_export_data, normalization_errors = ImportExportService.normalize_import_data(
            export_data.model_dump(by_alias=True)
        )
        if normalization_errors:
            logger.warning(f"导出数据规范化提示: {normalization_errors}")
        export_data = ProjectExportData.model_validate(normalized_export_data)
        
        logger.info(f"项目导出完成: {project_id}")
        return export_data
    
    @staticmethod
    async def _export_chapters(project_id: str, db: AsyncSession) -> List[ChapterExportData]:
        """导出章节"""
        result = await db.execute(
            select(Chapter)
            .where(Chapter.project_id == project_id)
            .order_by(Chapter.chapter_number)
        )
        chapters = result.scalars().all()
        
        # 构建大纲ID到标题的映射
        outline_mapping = {}
        if chapters:
            outline_ids = [ch.outline_id for ch in chapters if ch.outline_id]
            if outline_ids:
                outline_result = await db.execute(
                    select(Outline).where(Outline.id.in_(outline_ids))
                )
                outlines = outline_result.scalars().all()
                outline_mapping = {ol.id: ol.title for ol in outlines}
        
        exported_chapters = []
        for ch in chapters:
            # 解析expansion_plan JSON
            expansion_plan = None
            if ch.expansion_plan:
                try:
                    expansion_plan = json.loads(ch.expansion_plan) if isinstance(ch.expansion_plan, str) else ch.expansion_plan
                except Exception:
                    expansion_plan = None
            
            exported_chapters.append(ChapterExportData(
                title=ch.title,
                content=ch.content,
                summary=ch.summary,
                chapter_number=ch.chapter_number,
                word_count=ch.word_count or 0,
                status=ch.status,
                created_at=ch.created_at.isoformat() if ch.created_at else None,
                outline_title=outline_mapping.get(ch.outline_id) if ch.outline_id else None,
                sub_index=ch.sub_index,
                expansion_plan=expansion_plan
            ))
        
        return exported_chapters
    
    @staticmethod
    async def _export_characters(project_id: str, db: AsyncSession) -> List[CharacterExportData]:
        """导出角色"""
        result = await db.execute(
            select(Character).where(Character.project_id == project_id)
        )
        characters = result.scalars().all()
        
        exported = []
        for char in characters:
            # 解析traits JSON
            traits = None
            if char.traits:
                try:
                    traits = json.loads(char.traits) if isinstance(char.traits, str) else char.traits
                except Exception:
                    traits = None
            
            exported.append(CharacterExportData(
                name=char.name,
                age=char.age,
                gender=char.gender,
                is_organization=char.is_organization or False,
                role_type=char.role_type,
                personality=char.personality,
                background=char.background,
                appearance=char.appearance,
                traits=traits,
                organization_type=char.organization_type,
                organization_purpose=char.organization_purpose,
                created_at=char.created_at.isoformat() if char.created_at else None
            ))
        
        return exported
    
    @staticmethod
    async def _export_outlines(project_id: str, db: AsyncSession) -> List[OutlineExportData]:
        """导出大纲"""
        result = await db.execute(
            select(Outline)
            .where(Outline.project_id == project_id)
            .order_by(Outline.order_index)
        )
        outlines = result.scalars().all()
        
        return [
            OutlineExportData(
                title=ol.title,
                content=ol.content,
                structure=ol.structure,
                order_index=ol.order_index,
                created_at=ol.created_at.isoformat() if ol.created_at else None
            )
            for ol in outlines
        ]
    
    @staticmethod
    async def _export_relationships(project_id: str, db: AsyncSession) -> List[RelationshipExportData]:
        """导出关系"""
        result = await db.execute(
            select(CharacterRelationship, Character)
            .join(Character, CharacterRelationship.character_from_id == Character.id)
            .where(CharacterRelationship.project_id == project_id)
        )
        relationships = result.all()
        
        exported = []
        for rel, char_from in relationships:
            # 获取目标角色名称
            target_result = await db.execute(
                select(Character).where(Character.id == rel.character_to_id)
            )
            char_to = target_result.scalar_one_or_none()
            
            if char_to:
                exported.append(RelationshipExportData(
                    source_name=char_from.name,
                    target_name=char_to.name,
                    relationship_name=rel.relationship_name,
                    intimacy_level=rel.intimacy_level or 50,
                    status=rel.status or "active",
                    description=rel.description,
                    started_at=rel.started_at
                ))
        
        return exported
    
    @staticmethod
    async def _export_organizations(project_id: str, db: AsyncSession) -> List[OrganizationExportData]:
        """导出组织详情"""
        result = await db.execute(
            select(Organization, Character)
            .join(Character, Organization.character_id == Character.id)
            .where(Organization.project_id == project_id)
        )
        organizations = result.all()
        
        exported = []
        for org, char in organizations:
            # 获取父组织名称
            parent_name = None
            if org.parent_org_id:
                parent_result = await db.execute(
                    select(Organization, Character)
                    .join(Character, Organization.character_id == Character.id)
                    .where(Organization.id == org.parent_org_id)
                )
                parent_data = parent_result.first()
                if parent_data:
                    parent_name = parent_data[1].name
            
            exported.append(OrganizationExportData(
                character_name=char.name,
                parent_org_name=parent_name,
                power_level=org.power_level or 50,
                member_count=org.member_count or 0,
                location=org.location,
                motto=org.motto,
                color=org.color
            ))
        
        return exported
    
    @staticmethod
    async def _export_organization_members(project_id: str, db: AsyncSession) -> List[OrganizationMemberExportData]:
        """导出组织成员"""
        result = await db.execute(
            select(OrganizationMember, Organization, Character)
            .join(Organization, OrganizationMember.organization_id == Organization.id)
            .join(Character, Organization.character_id == Character.id)
            .where(Organization.project_id == project_id)
        )
        members = result.all()
        
        exported = []
        for member, org, org_char in members:
            # 获取成员角色名称
            char_result = await db.execute(
                select(Character).where(Character.id == member.character_id)
            )
            member_char = char_result.scalar_one_or_none()
            
            if member_char:
                exported.append(OrganizationMemberExportData(
                    organization_name=org_char.name,
                    character_name=member_char.name,
                    position=member.position,
                    rank=member.rank or 0,
                    status=member.status or "active",
                    joined_at=member.joined_at,
                    loyalty=member.loyalty or 50,
                    contribution=member.contribution or 0,
                    notes=member.notes
                ))
        
        return exported
    
    @staticmethod
    async def _export_writing_styles(project_id: str, db: AsyncSession) -> List[WritingStyleExportData]:
        """导出写作风格（用户自定义风格）"""
        # 获取项目所属用户
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return []
        
        # 导出该用户的自定义风格（不包括全局预设）
        result = await db.execute(
            select(WritingStyle)
            .where(WritingStyle.user_id == project.user_id)
            .order_by(WritingStyle.order_index)
        )
        styles = result.scalars().all()
        
        return [
            WritingStyleExportData(
                name=style.name,
                style_type=style.style_type,
                preset_id=style.preset_id,
                description=style.description,
                prompt_content=style.prompt_content,
                order_index=style.order_index or 0
            )
            for style in styles
        ]
    
    @staticmethod
    async def _export_generation_history(project_id: str, db: AsyncSession) -> List[GenerationHistoryExportData]:
        """导出生成历史"""
        result = await db.execute(
            select(GenerationHistory, Chapter)
            .outerjoin(Chapter, GenerationHistory.chapter_id == Chapter.id)
            .where(GenerationHistory.project_id == project_id)
            .order_by(GenerationHistory.created_at.desc())
            .limit(100)  # 限制最多导出100条历史记录
        )
        histories = result.all()
        
        return [
            GenerationHistoryExportData(
                chapter_title=chapter.title if chapter else None,
                prompt=history.prompt,
                generated_content=history.generated_content,
                model=history.model,
                tokens_used=history.tokens_used,
                generation_time=history.generation_time,
                created_at=history.created_at.isoformat() if history.created_at else None
            )
            for history, chapter in histories
        ]
    
    @staticmethod
    async def _export_careers(project_id: str, db: AsyncSession) -> List[CareerExportData]:
        """导出职业系统"""
        result = await db.execute(
            select(Career)
            .where(Career.project_id == project_id)
            .order_by(Career.type, Career.created_at)
        )
        careers = result.scalars().all()
        
        return [
            CareerExportData(
                name=career.name,
                type=career.type,
                description=career.description,
                category=career.category,
                stages=career.stages,
                max_stage=career.max_stage or 10,
                requirements=career.requirements,
                special_abilities=career.special_abilities,
                worldview_rules=career.worldview_rules,
                attribute_bonuses=career.attribute_bonuses,
                source=career.source or "ai",
                created_at=career.created_at.isoformat() if career.created_at else None
            )
            for career in careers
        ]
    
    @staticmethod
    async def _export_character_careers(project_id: str, db: AsyncSession) -> List[CharacterCareerExportData]:
        """导出角色职业关联"""
        # 查询所有属于该项目的角色职业关联
        result = await db.execute(
            select(CharacterCareer, Character, Career)
            .join(Character, CharacterCareer.character_id == Character.id)
            .join(Career, CharacterCareer.career_id == Career.id)
            .where(Character.project_id == project_id)
        )
        character_careers = result.all()
        
        return [
            CharacterCareerExportData(
                character_name=char.name,
                career_name=career.name,
                career_type=cc.career_type,
                current_stage=cc.current_stage or 1,
                stage_progress=cc.stage_progress or 0,
                started_at=cc.started_at,
                reached_current_stage_at=cc.reached_current_stage_at,
                notes=cc.notes
            )
            for cc, char, career in character_careers
        ]
    
    @staticmethod
    async def _export_story_memories(project_id: str, db: AsyncSession) -> List[StoryMemoryExportData]:
        """导出故事记忆"""
        # 构建章节ID到标题的映射
        chapter_result = await db.execute(
            select(Chapter).where(Chapter.project_id == project_id)
        )
        chapters = chapter_result.scalars().all()
        chapter_mapping = {ch.id: ch.title for ch in chapters}
        
        # 构建角色ID到名称的映射
        char_result = await db.execute(
            select(Character).where(Character.project_id == project_id)
        )
        characters = char_result.scalars().all()
        char_mapping = {char.id: char.name for char in characters}
        
        result = await db.execute(
            select(StoryMemory)
            .where(StoryMemory.project_id == project_id)
            .order_by(StoryMemory.story_timeline, StoryMemory.chapter_position)
        )
        memories = result.scalars().all()
        
        exported = []
        for mem in memories:
            # 将角色ID列表转换为名称列表
            related_char_names = None
            if mem.related_characters:
                related_char_names = [
                    char_mapping.get(char_id, char_id)
                    for char_id in mem.related_characters
                ]
            
            exported.append(StoryMemoryExportData(
                id=mem.id,
                chapter_title=chapter_mapping.get(mem.chapter_id) if mem.chapter_id else None,
                memory_type=mem.memory_type,
                title=mem.title,
                content=mem.content,
                full_context=mem.full_context,
                related_characters=related_char_names,
                related_locations=mem.related_locations,
                tags=mem.tags,
                importance_score=mem.importance_score or 0.5,
                story_timeline=mem.story_timeline,
                chapter_position=mem.chapter_position or 0,
                text_length=mem.text_length or 0,
                is_foreshadow=mem.is_foreshadow or 0,
                foreshadow_strength=mem.foreshadow_strength,
                created_at=mem.created_at.isoformat() if mem.created_at else None
            ))
        
        return exported
    
    @staticmethod
    async def _export_plot_analysis(project_id: str, db: AsyncSession) -> List[PlotAnalysisExportData]:
        """导出剧情分析"""
        # 构建章节ID到标题的映射
        chapter_result = await db.execute(
            select(Chapter).where(Chapter.project_id == project_id)
        )
        chapters = chapter_result.scalars().all()
        chapter_mapping = {ch.id: ch.title for ch in chapters}
        
        result = await db.execute(
            select(PlotAnalysis)
            .where(PlotAnalysis.project_id == project_id)
        )
        analyses = result.scalars().all()
        
        exported = []
        for analysis in analyses:
            chapter_title = chapter_mapping.get(analysis.chapter_id)
            if not chapter_title:
                continue  # 跳过没有关联章节的分析
            
            exported.append(PlotAnalysisExportData(
                chapter_title=chapter_title,
                plot_stage=analysis.plot_stage,
                conflict_level=analysis.conflict_level,
                conflict_types=analysis.conflict_types,
                emotional_tone=analysis.emotional_tone,
                emotional_intensity=analysis.emotional_intensity,
                emotional_curve=analysis.emotional_curve,
                hooks=analysis.hooks,
                hooks_count=analysis.hooks_count or 0,
                hooks_avg_strength=analysis.hooks_avg_strength,
                foreshadows=analysis.foreshadows,
                foreshadows_planted=analysis.foreshadows_planted or 0,
                foreshadows_resolved=analysis.foreshadows_resolved or 0,
                plot_points=analysis.plot_points,
                plot_points_count=analysis.plot_points_count or 0,
                character_states=analysis.character_states,
                scenes=analysis.scenes,
                pacing=analysis.pacing,
                overall_quality_score=analysis.overall_quality_score,
                pacing_score=analysis.pacing_score,
                engagement_score=analysis.engagement_score,
                coherence_score=analysis.coherence_score,
                analysis_report=analysis.analysis_report,
                suggestions=analysis.suggestions,
                word_count=analysis.word_count,
                dialogue_ratio=analysis.dialogue_ratio,
                description_ratio=analysis.description_ratio,
                created_at=analysis.created_at.isoformat() if analysis.created_at else None
            ))
        
        return exported

    @staticmethod
    async def _export_foreshadows(project_id: str, db: AsyncSession) -> List[ForeshadowExportData]:
        """导出伏笔"""
        result = await db.execute(
            select(Foreshadow)
            .where(Foreshadow.project_id == project_id)
            .order_by(Foreshadow.plant_chapter_number, Foreshadow.created_at)
        )
        foreshadows = result.scalars().all()

        exported = []
        for foreshadow in foreshadows:
            exported.append(ForeshadowExportData(
                id=foreshadow.id,
                title=foreshadow.title,
                content=foreshadow.content,
                hint_text=foreshadow.hint_text,
                resolution_text=foreshadow.resolution_text,
                source_type=foreshadow.source_type or "manual",
                source_memory_id=foreshadow.source_memory_id,
                source_analysis_id=foreshadow.source_analysis_id,
                plant_chapter_number=foreshadow.plant_chapter_number,
                target_resolve_chapter_number=foreshadow.target_resolve_chapter_number,
                actual_resolve_chapter_number=foreshadow.actual_resolve_chapter_number,
                status=foreshadow.status or "pending",
                is_long_term=bool(foreshadow.is_long_term),
                importance=foreshadow.importance if foreshadow.importance is not None else 0.5,
                strength=foreshadow.strength if foreshadow.strength is not None else 5,
                subtlety=foreshadow.subtlety if foreshadow.subtlety is not None else 5,
                urgency=foreshadow.urgency if foreshadow.urgency is not None else 0,
                related_characters=foreshadow.related_characters,
                related_foreshadow_ids=foreshadow.related_foreshadow_ids,
                tags=foreshadow.tags,
                category=foreshadow.category,
                notes=foreshadow.notes,
                resolution_notes=foreshadow.resolution_notes,
                auto_remind=bool(foreshadow.auto_remind),
                remind_before_chapters=foreshadow.remind_before_chapters if foreshadow.remind_before_chapters is not None else 5,
                include_in_context=bool(foreshadow.include_in_context),
                created_at=foreshadow.created_at.isoformat() if foreshadow.created_at else None,
                updated_at=foreshadow.updated_at.isoformat() if foreshadow.updated_at else None,
                planted_at=foreshadow.planted_at.isoformat() if foreshadow.planted_at else None,
                resolved_at=foreshadow.resolved_at.isoformat() if foreshadow.resolved_at else None
            ))

        return exported
    
    @staticmethod
    async def _export_project_default_style(project_id: str, db: AsyncSession) -> Optional[ProjectDefaultStyleExportData]:
        """导出项目默认风格"""
        result = await db.execute(
            select(ProjectDefaultStyle, WritingStyle)
            .join(WritingStyle, ProjectDefaultStyle.style_id == WritingStyle.id)
            .where(ProjectDefaultStyle.project_id == project_id)
        )
        row = result.first()
        
        if row:
            _, style = row
            return ProjectDefaultStyleExportData(style_name=style.name)
        
        return None
    
    @staticmethod
    def validate_import_data(data: Dict) -> ImportValidationResult:
        """
        验证导入数据
        
        Args:
            data: 导入的JSON数据
            
        Returns:
            ImportValidationResult: 验证结果
        """
        errors = []
        warnings = []
        statistics = {}
        normalized, normalization_errors = ImportExportService.normalize_import_data(data)
        errors.extend(normalization_errors)
        
        # 检查版本
        version = normalized.get("version", "")
        if not version:
            errors.append("缺少版本信息")
        elif version not in ImportExportService.SUPPORTED_VERSIONS:
            warnings.append(f"版本不匹配: 导入文件版本为 {version}, 当前支持版本为 {', '.join(ImportExportService.SUPPORTED_VERSIONS)}")

        try:
            ProjectExportData.model_validate(normalized)
        except ValidationError as exc:
            for issue in exc.errors():
                location = ".".join(str(item) for item in issue.get("loc", ()))
                message = issue.get("msg", "validation error")
                errors.append(f"{location}: {message}" if location else message)

        project = normalized.get("project", {})
        if not project.get("title"):
            errors.append("项目标题不能为空")
        
        # 统计数据（包含新增字段）
        statistics = {
            "chapters": len(normalized.get("chapters", [])),
            "characters": len(normalized.get("characters", [])),
            "outlines": len(normalized.get("outlines", [])),
            "relationships": len(normalized.get("relationships", [])),
            "organizations": len(normalized.get("organizations", [])),
            "organization_members": len(normalized.get("organization_members", [])),
            "writing_styles": len(normalized.get("writing_styles", [])),
            "generation_history": len(normalized.get("generation_history", [])),
            "careers": len(normalized.get("careers", [])),
            "character_careers": len(normalized.get("character_careers", [])),
            "story_memories": len(normalized.get("story_memories", [])),
            "plot_analysis": len(normalized.get("plot_analysis", [])),
            "foreshadows": len(normalized.get("foreshadows", [])),
            "has_default_style": normalized.get("project_default_style") is not None
        }
        
        # 检查数据完整性
        if statistics["chapters"] == 0:
            warnings.append("项目没有章节数据")
        
        if statistics["characters"] == 0:
            warnings.append("项目没有角色数据")
        
        project_name = project.get("title", "未知项目")
        
        return ImportValidationResult(
            valid=len(errors) == 0,
            version=version,
            project_name=project_name,
            statistics=statistics,
            errors=errors,
            warnings=warnings
        )
    
    @staticmethod
    async def import_project(
        data: Dict,
        db: AsyncSession,
        user_id: str
    ) -> ImportResult:
        """
        导入项目数据（创建新项目）
        
        Args:
            data: 导入的JSON数据
            db: 数据库会话
            user_id: 目标用户ID（导入后的项目归属）
            
        Returns:
            ImportResult: 导入结果
        """
        warnings = []
        statistics = {}
        
        try:
            # 验证数据
            validation = ImportExportService.validate_import_data(data)
            if not validation.valid:
                return ImportResult(
                    success=False,
                    message=f"数据验证失败: {', '.join(validation.errors)}",
                    statistics={},
                    warnings=validation.warnings
                )
            
            warnings.extend(validation.warnings)
            data, _ = ImportExportService.normalize_import_data(data)
            
            logger.info(f"开始导入项目: {validation.project_name}")
            
            # 创建项目
            project_data = data["project"]
            new_project = Project(user_id=user_id)
            ImportExportService._apply_project_fields(new_project, project_data)
            db.add(new_project)
            await db.flush()  # 获取project_id
            
            logger.info(f"创建项目成功: {new_project.id}")
            
            # 导入角色（包括组织）- 需要先导入角色，因为大纲可能需要角色信息
            char_mapping = await ImportExportService._import_characters(
                new_project.id, data.get("characters", []), db
            )
            statistics["characters"] = len(char_mapping)
            logger.info(f"导入角色数: {len(char_mapping)}")
            
            # 导入大纲 - 需要在章节之前导入，以便建立关联
            outline_mapping = await ImportExportService._import_outlines(
                new_project.id, data.get("outlines", []), db
            )
            statistics["outlines"] = len(outline_mapping)
            logger.info(f"导入大纲数: {len(outline_mapping)}")
            
            # 导入章节 - 使用大纲映射重建关联关系
            chapters_count = await ImportExportService._import_chapters(
                new_project.id, data.get("chapters", []), outline_mapping, db
            )
            statistics["chapters"] = chapters_count
            logger.info(f"导入章节数: {chapters_count}")
            
            # 导入关系
            relationships_count = await ImportExportService._import_relationships(
                new_project.id, data.get("relationships", []), char_mapping, db
            )
            statistics["relationships"] = relationships_count
            logger.info(f"导入关系数: {relationships_count}")
            
            # 导入组织详情
            org_mapping = await ImportExportService._import_organizations(
                new_project.id, data.get("organizations", []), char_mapping, db
            )
            statistics["organizations"] = len(org_mapping)
            logger.info(f"导入组织数: {len(org_mapping)}")
            
            # 导入组织成员
            org_members_count = await ImportExportService._import_organization_members(
                data.get("organization_members", []), char_mapping, org_mapping, db
            )
            statistics["organization_members"] = org_members_count
            logger.info(f"导入组织成员数: {org_members_count}")
            
            # 导入写作风格
            styles_count = await ImportExportService._import_writing_styles(
                new_project.id, data.get("writing_styles", []), db
            )
            statistics["writing_styles"] = styles_count
            logger.info(f"导入写作风格数: {styles_count}")
            
            # 导入职业系统
            career_mapping = await ImportExportService._import_careers(
                new_project.id, data.get("careers", []), db
            )
            statistics["careers"] = len(career_mapping)
            logger.info(f"导入职业数: {len(career_mapping)}")
            
            # 导入角色职业关联
            char_careers_count = await ImportExportService._import_character_careers(
                data.get("character_careers", []), char_mapping, career_mapping, db
            )
            statistics["character_careers"] = char_careers_count
            logger.info(f"导入角色职业关联数: {char_careers_count}")
            
            # 导入故事记忆
            # 需要先构建章节标题到ID的映射（使用章节号+标题组合确保唯一性）
            chapter_title_to_id = {}
            chapter_result = await db.execute(
                select(Chapter).where(Chapter.project_id == new_project.id)
            )
            imported_chapters = chapter_result.scalars().all()
            for ch in imported_chapters:
                # 使用标题作为key，如果有重复标题则取第一个（已导入的顺序）
                if ch.title and ch.title not in chapter_title_to_id:
                    chapter_title_to_id[ch.title] = ch.id
            chapter_number_to_id = {}
            for ch in imported_chapters:
                if ch.chapter_number is not None and ch.chapter_number not in chapter_number_to_id:
                    chapter_number_to_id[ch.chapter_number] = ch.id

            history_count = await ImportExportService._import_generation_history(
                new_project.id, data.get("generation_history", []), chapter_title_to_id, db
            )
            statistics["generation_history"] = history_count
            logger.info(f"导入生成历史数: {history_count}")
            
            memories_count = await ImportExportService._import_story_memories(
                new_project.id, data.get("story_memories", []), chapter_title_to_id, char_mapping, db
            )
            statistics["story_memories"] = memories_count
            logger.info(f"导入故事记忆数: {memories_count}")

            # 导入伏笔
            foreshadow_id_mapping, foreshadow_count = await ImportExportService._import_foreshadows(
                new_project.id,
                data.get("foreshadows", []),
                chapter_number_to_id,
                db
            )
            statistics["foreshadows"] = foreshadow_count
            logger.info(f"导入伏笔数: {foreshadow_count}")
            
            # 导入剧情分析（传入user_id以便创建分析任务记录）
            plot_analysis_count = await ImportExportService._import_plot_analysis(
                new_project.id,
                data.get("plot_analysis", []),
                chapter_title_to_id,
                db,
                user_id,
                foreshadow_id_mapping
            )
            statistics["plot_analysis"] = plot_analysis_count
            logger.info(f"导入剧情分析数: {plot_analysis_count}")
            
            # 导入项目默认风格
            default_style_imported = await ImportExportService._import_project_default_style(
                new_project.id, data.get("project_default_style"), db
            )
            statistics["project_default_style"] = 1 if default_style_imported else 0
            if default_style_imported:
                logger.info("导入项目默认风格成功")
            
            # 提交事务
            await db.commit()

            try:
                rebuilt_vectors = await ImportExportService.rebuild_project_memory_index(
                    new_project.id,
                    user_id,
                    db,
                )
                logger.info(f"重建项目向量记忆数: {rebuilt_vectors}")
            except Exception as exc:
                warning = f"向量记忆重建失败: {exc}"
                warnings.append(warning)
                logger.warning(warning)
            
            logger.info(f"项目导入完成: {new_project.id}")
            
            return ImportResult(
                success=True,
                project_id=new_project.id,
                message="项目导入成功",
                statistics=statistics,
                warnings=warnings
            )
            
        except Exception as e:
            await db.rollback()
            logger.error(f"导入项目失败: {str(e)}", exc_info=True)
            return ImportResult(
                success=False,
                message=f"导入失败: {str(e)}",
                statistics=statistics,
                warnings=warnings
            )

    @staticmethod
    async def sync_project(
        target_project_id: str,
        data: Dict,
        db: AsyncSession,
        user_id: str,
        strict_source_match: bool = True
    ) -> ImportResult:
        """
        同步导入到指定项目（保留项目ID，覆盖项目内容）
        """
        warnings: List[str] = []
        statistics: Dict[str, int] = {}

        try:
            validation = ImportExportService.validate_import_data(data)
            if not validation.valid:
                return ImportResult(
                    success=False,
                    message=f"数据验证失败: {', '.join(validation.errors)}",
                    statistics={},
                    warnings=validation.warnings
                )

            warnings.extend(validation.warnings)
            data, _ = ImportExportService.normalize_import_data(data)

            result = await db.execute(
                select(Project).where(
                    Project.id == target_project_id,
                    Project.user_id == user_id
                )
            )
            target_project = result.scalar_one_or_none()
            if not target_project:
                return ImportResult(
                    success=False,
                    message="目标项目不存在或无权访问",
                    statistics={},
                    warnings=warnings
                )

            source_project_id = data.get("source_project_id")
            if strict_source_match:
                if not source_project_id:
                    return ImportResult(
                        success=False,
                        message="严格同步失败：导入文件缺少 source_project_id",
                        statistics={},
                        warnings=warnings
                    )
                if source_project_id != target_project_id:
                    return ImportResult(
                        success=False,
                        message=(
                            f"严格同步失败：source_project_id={source_project_id} "
                            f"与目标项目ID={target_project_id} 不一致"
                        ),
                        statistics={},
                        warnings=warnings
                    )

            logger.info(
                f"开始同步项目: target_project_id={target_project_id}, "
                f"project_name={validation.project_name}, strict_source_match={strict_source_match}"
            )

            await ImportExportService._clear_project_related_data(
                target_project_id,
                db,
                user_id=user_id
            )

            project_data = data["project"]
            ImportExportService._apply_project_fields(target_project, project_data)
            await db.flush()

            char_mapping = await ImportExportService._import_characters(
                target_project.id, data.get("characters", []), db
            )
            statistics["characters"] = len(char_mapping)

            outline_mapping = await ImportExportService._import_outlines(
                target_project.id, data.get("outlines", []), db
            )
            statistics["outlines"] = len(outline_mapping)

            chapters_count = await ImportExportService._import_chapters(
                target_project.id, data.get("chapters", []), outline_mapping, db
            )
            statistics["chapters"] = chapters_count

            relationships_count = await ImportExportService._import_relationships(
                target_project.id, data.get("relationships", []), char_mapping, db
            )
            statistics["relationships"] = relationships_count

            org_mapping = await ImportExportService._import_organizations(
                target_project.id, data.get("organizations", []), char_mapping, db
            )
            statistics["organizations"] = len(org_mapping)

            org_members_count = await ImportExportService._import_organization_members(
                data.get("organization_members", []), char_mapping, org_mapping, db
            )
            statistics["organization_members"] = org_members_count

            styles_count = await ImportExportService._import_writing_styles(
                target_project.id, data.get("writing_styles", []), db
            )
            statistics["writing_styles"] = styles_count

            career_mapping = await ImportExportService._import_careers(
                target_project.id, data.get("careers", []), db
            )
            statistics["careers"] = len(career_mapping)

            char_careers_count = await ImportExportService._import_character_careers(
                data.get("character_careers", []), char_mapping, career_mapping, db
            )
            statistics["character_careers"] = char_careers_count

            chapter_title_to_id: Dict[str, str] = {}
            chapter_number_to_id: Dict[int, str] = {}
            chapter_result = await db.execute(
                select(Chapter).where(Chapter.project_id == target_project.id)
            )
            imported_chapters = chapter_result.scalars().all()
            for ch in imported_chapters:
                if ch.title and ch.title not in chapter_title_to_id:
                    chapter_title_to_id[ch.title] = ch.id
                if ch.chapter_number is not None and ch.chapter_number not in chapter_number_to_id:
                    chapter_number_to_id[ch.chapter_number] = ch.id

            history_count = await ImportExportService._import_generation_history(
                target_project.id, data.get("generation_history", []), chapter_title_to_id, db
            )
            statistics["generation_history"] = history_count

            memories_count = await ImportExportService._import_story_memories(
                target_project.id, data.get("story_memories", []), chapter_title_to_id, char_mapping, db
            )
            statistics["story_memories"] = memories_count

            foreshadow_id_mapping, foreshadow_count = await ImportExportService._import_foreshadows(
                target_project.id,
                data.get("foreshadows", []),
                chapter_number_to_id,
                db
            )
            statistics["foreshadows"] = foreshadow_count

            plot_analysis_count = await ImportExportService._import_plot_analysis(
                target_project.id,
                data.get("plot_analysis", []),
                chapter_title_to_id,
                db,
                user_id,
                foreshadow_id_mapping
            )
            statistics["plot_analysis"] = plot_analysis_count

            default_style_imported = await ImportExportService._import_project_default_style(
                target_project.id, data.get("project_default_style"), db
            )
            statistics["project_default_style"] = 1 if default_style_imported else 0

            await db.commit()
            await db.refresh(target_project)

            try:
                rebuilt_vectors = await ImportExportService.rebuild_project_memory_index(
                    target_project.id,
                    user_id,
                    db,
                )
                logger.info(f"重建同步项目向量记忆数: {rebuilt_vectors}")
            except Exception as exc:
                warning = f"向量记忆重建失败: {exc}"
                warnings.append(warning)
                logger.warning(warning)

            return ImportResult(
                success=True,
                project_id=target_project.id,
                message="项目同步成功",
                statistics=statistics,
                warnings=warnings
            )

        except Exception as e:
            await db.rollback()
            logger.error(f"同步项目失败: {str(e)}", exc_info=True)
            return ImportResult(
                success=False,
                message=f"同步失败: {str(e)}",
                statistics=statistics,
                warnings=warnings
            )
    
    @staticmethod
    async def _import_chapters(
        project_id: str,
        chapters_data: List[Dict],
        outline_mapping: Dict[str, str],
        db: AsyncSession
    ) -> int:
        """导入章节"""
        count = 0
        for ch_data in chapters_data:
            # 根据大纲标题查找对应的新大纲ID
            outline_id = None
            outline_title = ch_data.get("outline_title")
            if outline_title and outline_title in outline_mapping:
                outline_id = outline_mapping[outline_title]
            
            # 处理expansion_plan
            expansion_plan = ch_data.get("expansion_plan")
            if isinstance(expansion_plan, dict):
                expansion_plan = json.dumps(expansion_plan, ensure_ascii=False)
            
            chapter = Chapter(
                project_id=project_id,
                title=ch_data.get("title"),
                content=ch_data.get("content"),
                summary=ch_data.get("summary"),
                chapter_number=ch_data.get("chapter_number"),
                word_count=ch_data.get("word_count", 0),
                status=ch_data.get("status", "draft"),
                outline_id=outline_id,
                sub_index=ch_data.get("sub_index"),
                expansion_plan=expansion_plan
            )
            db.add(chapter)
            count += 1
        
        return count

    @staticmethod
    def _parse_optional_datetime(value: Optional[str]) -> Optional[datetime]:
        """解析可选时间字符串"""
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

    @staticmethod
    async def _import_foreshadows(
        project_id: str,
        foreshadows_data: List[Dict],
        chapter_number_to_id: Dict[int, str],
        db: AsyncSession
    ) -> Tuple[Dict[str, str], int]:
        """导入伏笔，返回导出ID到新ID的映射和导入数量"""
        foreshadow_id_mapping: Dict[str, str] = {}
        pending_related_updates: List[Tuple[Foreshadow, List[str]]] = []
        count = 0

        for fs_data in foreshadows_data:
            plant_chapter_number = fs_data.get("plant_chapter_number")
            target_resolve_chapter_number = fs_data.get("target_resolve_chapter_number")
            actual_resolve_chapter_number = fs_data.get("actual_resolve_chapter_number")

            foreshadow = Foreshadow(
                project_id=project_id,
                title=fs_data.get("title"),
                content=fs_data.get("content"),
                hint_text=fs_data.get("hint_text"),
                resolution_text=fs_data.get("resolution_text"),
                source_type=fs_data.get("source_type", "manual"),
                source_memory_id=fs_data.get("source_memory_id"),
                source_analysis_id=fs_data.get("source_analysis_id"),
                plant_chapter_id=chapter_number_to_id.get(plant_chapter_number),
                plant_chapter_number=plant_chapter_number,
                target_resolve_chapter_id=chapter_number_to_id.get(target_resolve_chapter_number),
                target_resolve_chapter_number=target_resolve_chapter_number,
                actual_resolve_chapter_id=chapter_number_to_id.get(actual_resolve_chapter_number),
                actual_resolve_chapter_number=actual_resolve_chapter_number,
                status=fs_data.get("status", "pending"),
                is_long_term=fs_data.get("is_long_term", False),
                importance=fs_data.get("importance", 0.5),
                strength=fs_data.get("strength", 5),
                subtlety=fs_data.get("subtlety", 5),
                urgency=fs_data.get("urgency", 0),
                related_characters=fs_data.get("related_characters"),
                tags=fs_data.get("tags"),
                category=fs_data.get("category"),
                notes=fs_data.get("notes"),
                resolution_notes=fs_data.get("resolution_notes"),
                auto_remind=fs_data.get("auto_remind", True),
                remind_before_chapters=fs_data.get("remind_before_chapters", 5),
                include_in_context=fs_data.get("include_in_context", True),
                created_at=ImportExportService._parse_optional_datetime(fs_data.get("created_at")),
                updated_at=ImportExportService._parse_optional_datetime(fs_data.get("updated_at")),
                planted_at=ImportExportService._parse_optional_datetime(fs_data.get("planted_at")),
                resolved_at=ImportExportService._parse_optional_datetime(fs_data.get("resolved_at")),
            )
            db.add(foreshadow)
            await db.flush()

            exported_id = fs_data.get("id")
            if exported_id:
                foreshadow_id_mapping[exported_id] = foreshadow.id

            pending_related_updates.append((foreshadow, fs_data.get("related_foreshadow_ids") or []))
            count += 1

        for foreshadow, related_export_ids in pending_related_updates:
            if not related_export_ids:
                continue
            foreshadow.related_foreshadow_ids = [
                foreshadow_id_mapping[exported_id]
                for exported_id in related_export_ids
                if exported_id in foreshadow_id_mapping
            ]

        return foreshadow_id_mapping, count
    
    @staticmethod
    async def _import_characters(
        project_id: str,
        characters_data: List[Dict],
        db: AsyncSession
    ) -> Dict[str, str]:
        """导入角色，返回名称到ID的映射"""
        char_mapping = {}
        
        for char_data in characters_data:
            # 处理traits
            traits = char_data.get("traits")
            if isinstance(traits, list):
                traits = json.dumps(traits, ensure_ascii=False)
            
            character = Character(
                project_id=project_id,
                name=char_data.get("name"),
                age=char_data.get("age"),
                gender=char_data.get("gender"),
                is_organization=char_data.get("is_organization", False),
                role_type=char_data.get("role_type"),
                personality=char_data.get("personality"),
                background=char_data.get("background"),
                appearance=char_data.get("appearance"),
                traits=traits,
                organization_type=char_data.get("organization_type"),
                organization_purpose=char_data.get("organization_purpose")
            )
            db.add(character)
            await db.flush()  # 获取ID
            char_mapping[char_data.get("name")] = character.id
        
        return char_mapping
    
    @staticmethod
    async def _import_outlines(
        project_id: str,
        outlines_data: List[Dict],
        db: AsyncSession
    ) -> Dict[str, str]:
        """导入大纲，返回标题到ID的映射"""
        outline_mapping = {}
        
        for ol_data in outlines_data:
            outline = Outline(
                project_id=project_id,
                title=ol_data.get("title"),
                content=ol_data.get("content"),
                structure=ol_data.get("structure"),
                order_index=ol_data.get("order_index")
            )
            db.add(outline)
            await db.flush()  # 获取ID
            outline_mapping[ol_data.get("title")] = outline.id
        
        return outline_mapping
    
    @staticmethod
    async def _import_relationships(
        project_id: str,
        relationships_data: List[Dict],
        char_mapping: Dict[str, str],
        db: AsyncSession
    ) -> int:
        """导入关系"""
        count = 0
        for rel_data in relationships_data:
            source_name = rel_data.get("source_name")
            target_name = rel_data.get("target_name")
            
            # 查找角色ID
            source_id = char_mapping.get(source_name)
            target_id = char_mapping.get(target_name)
            
            if source_id and target_id:
                relationship = CharacterRelationship(
                    project_id=project_id,
                    character_from_id=source_id,
                    character_to_id=target_id,
                    relationship_name=rel_data.get("relationship_name"),
                    intimacy_level=rel_data.get("intimacy_level", 50),
                    status=rel_data.get("status", "active"),
                    description=rel_data.get("description"),
                    started_at=rel_data.get("started_at")
                )
                db.add(relationship)
                count += 1
        
        return count
    
    @staticmethod
    async def _import_organizations(
        project_id: str,
        organizations_data: List[Dict],
        char_mapping: Dict[str, str],
        db: AsyncSession
    ) -> Dict[str, str]:
        """导入组织详情，返回名称到ID的映射"""
        org_mapping = {}
        
        # 第一遍：创建所有组织（不设置父组织）
        temp_orgs = []
        for org_data in organizations_data:
            char_name = org_data.get("character_name")
            char_id = char_mapping.get(char_name)
            
            if char_id:
                organization = Organization(
                    project_id=project_id,
                    character_id=char_id,
                    power_level=org_data.get("power_level", 50),
                    member_count=org_data.get("member_count", 0),
                    location=org_data.get("location"),
                    motto=org_data.get("motto"),
                    color=org_data.get("color")
                )
                db.add(organization)
                temp_orgs.append((organization, org_data.get("parent_org_name")))
        
        await db.flush()  # 获取所有组织的ID
        
        # 建立名称到ID的映射
        for org, _ in temp_orgs:
            # 通过character_id查找角色名
            result = await db.execute(
                select(Character).where(Character.id == org.character_id)
            )
            char = result.scalar_one_or_none()
            if char:
                org_mapping[char.name] = org.id
        
        # 第二遍：设置父组织关系
        for org, parent_name in temp_orgs:
            if parent_name:
                parent_id = org_mapping.get(parent_name)
                if parent_id:
                    org.parent_org_id = parent_id
        
        return org_mapping
    
    @staticmethod
    async def _import_organization_members(
        org_members_data: List[Dict],
        char_mapping: Dict[str, str],
        org_mapping: Dict[str, str],
        db: AsyncSession
    ) -> int:
        """导入组织成员"""
        count = 0
        for member_data in org_members_data:
            org_name = member_data.get("organization_name")
            char_name = member_data.get("character_name")
            
            org_id = org_mapping.get(org_name)
            char_id = char_mapping.get(char_name)
            
            if org_id and char_id:
                member = OrganizationMember(
                    organization_id=org_id,
                    character_id=char_id,
                    position=member_data.get("position"),
                    rank=member_data.get("rank", 0),
                    status=member_data.get("status", "active"),
                    joined_at=member_data.get("joined_at"),
                    loyalty=member_data.get("loyalty", 50),
                    contribution=member_data.get("contribution", 0),
                    notes=member_data.get("notes")
                )
                db.add(member)
                count += 1
        
        return count
    
    @staticmethod
    async def _import_writing_styles(
        project_id: str,
        styles_data: List[Dict],
        db: AsyncSession
    ) -> int:
        """导入写作风格（用户自定义风格）"""
        # 获取项目所属用户
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return 0
        
        count = 0
        for style_data in styles_data:
            # 检查是否已存在同名风格（避免重复导入）
            existing = await db.execute(
                select(WritingStyle).where(
                    WritingStyle.user_id == project.user_id,
                    WritingStyle.name == style_data.get("name")
                )
            )
            # 使用 first() 避免多行时报错
            if existing.first():
                logger.debug(f"风格 {style_data.get('name')} 已存在，跳过导入")
                continue
            
            style = WritingStyle(
                user_id=project.user_id,  # 使用 user_id 而不是 project_id
                name=style_data.get("name"),
                style_type=style_data.get("style_type"),
                preset_id=style_data.get("preset_id"),
                description=style_data.get("description"),
                prompt_content=style_data.get("prompt_content"),
                order_index=style_data.get("order_index", 0)
            )
            db.add(style)
            count += 1
        
        return count
    
    @staticmethod
    async def _import_careers(
        project_id: str,
        careers_data: List[Dict],
        db: AsyncSession
    ) -> Dict[str, str]:
        """导入职业，返回名称到ID的映射"""
        career_mapping = {}
        
        for career_data in careers_data:
            career = Career(
                project_id=project_id,
                name=career_data.get("name"),
                type=career_data.get("type", "main"),
                description=career_data.get("description"),
                category=career_data.get("category"),
                stages=career_data.get("stages", "[]"),
                max_stage=career_data.get("max_stage", 10),
                requirements=career_data.get("requirements"),
                special_abilities=career_data.get("special_abilities"),
                worldview_rules=career_data.get("worldview_rules"),
                attribute_bonuses=career_data.get("attribute_bonuses"),
                source=career_data.get("source", "ai")
            )
            db.add(career)
            await db.flush()
            career_mapping[career_data.get("name")] = career.id
        
        return career_mapping
    
    @staticmethod
    async def _import_character_careers(
        character_careers_data: List[Dict],
        char_mapping: Dict[str, str],
        career_mapping: Dict[str, str],
        db: AsyncSession
    ) -> int:
        """导入角色职业关联"""
        count = 0
        for cc_data in character_careers_data:
            char_name = cc_data.get("character_name")
            career_name = cc_data.get("career_name")
            
            char_id = char_mapping.get(char_name)
            career_id = career_mapping.get(career_name)
            
            if char_id and career_id:
                # 检查是否已存在（使用 first() 避免多行时报错）
                existing = await db.execute(
                    select(CharacterCareer).where(
                        CharacterCareer.character_id == char_id,
                        CharacterCareer.career_id == career_id
                    )
                )
                if existing.first():
                    continue
                
                char_career = CharacterCareer(
                    character_id=char_id,
                    career_id=career_id,
                    career_type=cc_data.get("career_type", "main"),
                    current_stage=cc_data.get("current_stage", 1),
                    stage_progress=cc_data.get("stage_progress", 0),
                    started_at=cc_data.get("started_at"),
                    reached_current_stage_at=cc_data.get("reached_current_stage_at"),
                    notes=cc_data.get("notes")
                )
                db.add(char_career)
                count += 1
                
                # 同时更新角色的主职业信息
                if cc_data.get("career_type") == "main":
                    char_result = await db.execute(
                        select(Character).where(Character.id == char_id)
                    )
                    char = char_result.scalar_one_or_none()
                    if char:
                        char.main_career_id = career_id
                        char.main_career_stage = cc_data.get("current_stage", 1)
        
        return count
    
    @staticmethod
    async def _import_story_memories(
        project_id: str,
        memories_data: List[Dict],
        chapter_mapping: Dict[str, str],
        char_mapping: Dict[str, str],
        db: AsyncSession
    ) -> int:
        """导入故事记忆"""
        count = 0
        for mem_data in memories_data:
            memory_id = mem_data.get("id") or str(uuid.uuid4())
            # 将章节标题转换为ID
            chapter_id = None
            chapter_title = mem_data.get("chapter_title")
            if chapter_title and chapter_title in chapter_mapping:
                chapter_id = chapter_mapping[chapter_title]
            
            # 将角色名称列表转换为ID列表
            related_char_ids = None
            related_char_names = mem_data.get("related_characters")
            if related_char_names:
                related_char_ids = [
                    char_mapping.get(name)
                    for name in related_char_names
                    if char_mapping.get(name)
                ]
            
            memory = StoryMemory(
                id=memory_id,
                project_id=project_id,
                chapter_id=chapter_id,
                memory_type=mem_data.get("memory_type"),
                title=mem_data.get("title"),
                content=mem_data.get("content"),
                full_context=mem_data.get("full_context"),
                related_characters=related_char_ids,
                related_locations=mem_data.get("related_locations"),
                tags=mem_data.get("tags"),
                importance_score=mem_data.get("importance_score", 0.5),
                story_timeline=mem_data.get("story_timeline", 0),
                chapter_position=mem_data.get("chapter_position", 0),
                text_length=mem_data.get("text_length", 0),
                is_foreshadow=mem_data.get("is_foreshadow", 0),
                foreshadow_strength=mem_data.get("foreshadow_strength"),
                vector_id=memory_id,
            )
            db.add(memory)
            count += 1
        
        return count
    
    @staticmethod
    async def _import_plot_analysis(
        project_id: str,
        plot_data: List[Dict],
        chapter_mapping: Dict[str, str],
        db: AsyncSession,
        user_id: str = None,
        foreshadow_id_mapping: Optional[Dict[str, str]] = None
    ) -> int:
        """导入剧情分析，同时创建已完成的分析任务记录"""
        from datetime import datetime
        
        count = 0
        for analysis_data in plot_data:
            chapter_title = analysis_data.get("chapter_title")
            chapter_id = chapter_mapping.get(chapter_title)
            
            if not chapter_id:
                continue  # 跳过找不到章节的分析
            
            # 检查是否已存在该章节的分析（使用 first() 避免多行时报错）
            existing = await db.execute(
                select(PlotAnalysis).where(PlotAnalysis.chapter_id == chapter_id)
            )
            if existing.first():
                continue

            foreshadows = analysis_data.get("foreshadows")
            if foreshadows and foreshadow_id_mapping:
                foreshadows = [
                    {
                        **item,
                        "reference_foreshadow_id": foreshadow_id_mapping.get(
                            item.get("reference_foreshadow_id"),
                            item.get("reference_foreshadow_id")
                        )
                    }
                    if isinstance(item, dict) else item
                    for item in foreshadows
                ]
            
            analysis = PlotAnalysis(
                project_id=project_id,
                chapter_id=chapter_id,
                plot_stage=analysis_data.get("plot_stage"),
                conflict_level=analysis_data.get("conflict_level"),
                conflict_types=analysis_data.get("conflict_types"),
                emotional_tone=analysis_data.get("emotional_tone"),
                emotional_intensity=analysis_data.get("emotional_intensity"),
                emotional_curve=analysis_data.get("emotional_curve"),
                hooks=analysis_data.get("hooks"),
                hooks_count=analysis_data.get("hooks_count", 0),
                hooks_avg_strength=analysis_data.get("hooks_avg_strength"),
                foreshadows=foreshadows,
                foreshadows_planted=analysis_data.get("foreshadows_planted", 0),
                foreshadows_resolved=analysis_data.get("foreshadows_resolved", 0),
                plot_points=analysis_data.get("plot_points"),
                plot_points_count=analysis_data.get("plot_points_count", 0),
                character_states=analysis_data.get("character_states"),
                scenes=analysis_data.get("scenes"),
                pacing=analysis_data.get("pacing"),
                overall_quality_score=analysis_data.get("overall_quality_score"),
                pacing_score=analysis_data.get("pacing_score"),
                engagement_score=analysis_data.get("engagement_score"),
                coherence_score=analysis_data.get("coherence_score"),
                analysis_report=analysis_data.get("analysis_report"),
                suggestions=analysis_data.get("suggestions"),
                word_count=analysis_data.get("word_count"),
                dialogue_ratio=analysis_data.get("dialogue_ratio"),
                description_ratio=analysis_data.get("description_ratio")
            )
            db.add(analysis)
            
            # 同时创建已完成的分析任务记录，这样章节管理页面会显示"已分析"状态
            if user_id:
                now = datetime.utcnow()
                analysis_task = AnalysisTask(
                    chapter_id=chapter_id,
                    user_id=user_id,
                    project_id=project_id,
                    status='completed',
                    progress=100,
                    started_at=now,
                    completed_at=now
                )
                db.add(analysis_task)
            
            count += 1
        
        return count
    
    @staticmethod
    async def _import_project_default_style(
        project_id: str,
        default_style_data: Optional[Dict],
        db: AsyncSession
    ) -> bool:
        """导入项目默认风格"""
        if not default_style_data:
            return False
        
        style_name = default_style_data.get("style_name")
        if not style_name:
            return False
        
        # 获取项目所属用户
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return False
        
        # 查找对应的风格（优先查找用户自定义风格，然后是全局预设风格）
        # 先查用户自定义风格（使用 first() 避免多行时报错）
        style_result = await db.execute(
            select(WritingStyle).where(
                WritingStyle.user_id == project.user_id,
                WritingStyle.name == style_name
            )
        )
        style_row = style_result.first()
        style = style_row[0] if style_row else None
        
        # 如果用户自定义风格不存在，查找全局预设风格
        if not style:
            style_result = await db.execute(
                select(WritingStyle).where(
                    WritingStyle.user_id.is_(None),
                    WritingStyle.name == style_name
                )
            )
            style_row = style_result.first()
            style = style_row[0] if style_row else None
        
        if not style:
            logger.warning(f"导入项目默认风格时未找到风格: {style_name}")
            return False
        
        # 创建项目默认风格关联
        default_style = ProjectDefaultStyle(
            project_id=project_id,
            style_id=style.id
        )
        db.add(default_style)
        
        logger.info(f"项目默认风格导入成功: {style_name}, style_id={style.id}")
        return True
    
    @staticmethod
    async def export_characters(
        character_ids: List[str],
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        导出角色/组织卡片
        
        Args:
            character_ids: 要导出的角色/组织ID列表
            db: 数据库会话
            
        Returns:
            Dict: 导出的角色数据
        """
        logger.info(f"开始导出角色/组织: {len(character_ids)} 个")
        
        # 查询角色数据
        result = await db.execute(
            select(Character).where(Character.id.in_(character_ids))
        )
        characters = result.scalars().all()
        
        if not characters:
            raise ValueError("未找到指定的角色/组织")
        
        # 导出角色数据
        exported_characters = []
        for char in characters:
            # 解析 traits
            traits = None
            if char.traits:
                try:
                    traits = json.loads(char.traits) if isinstance(char.traits, str) else char.traits
                except Exception:
                    traits = None
            
            # 基础角色数据
            char_data = {
                "name": char.name,
                "age": char.age,
                "gender": char.gender,
                "is_organization": char.is_organization or False,
                "role_type": char.role_type,
                "personality": char.personality,
                "background": char.background,
                "appearance": char.appearance,
                "traits": traits,
                "organization_type": char.organization_type,
                "organization_purpose": char.organization_purpose,
                "avatar_url": char.avatar_url,
                "main_career_id": char.main_career_id,
                "main_career_stage": char.main_career_stage,
                "sub_careers": char.sub_careers,
                "created_at": char.created_at.isoformat() if char.created_at else None
            }
            
            # 如果是组织，添加组织专属字段
            if char.is_organization:
                org_result = await db.execute(
                    select(Organization).where(Organization.character_id == char.id)
                )
                org = org_result.scalar_one_or_none()
                
                if org:
                    char_data.update({
                        "power_level": org.power_level,
                        "location": org.location,
                        "motto": org.motto,
                        "color": org.color
                    })
                    
                    # 从 OrganizationMember 表导出结构化成员数据
                    members_result = await db.execute(
                        select(OrganizationMember).where(OrganizationMember.organization_id == org.id)
                    )
                    members = members_result.scalars().all()
                    if members:
                        char_data["organization_members_data"] = [
                            {
                                "character_id": m.character_id,
                                "position": m.position,
                                "rank": m.rank,
                                "loyalty": m.loyalty,
                                "contribution": m.contribution,
                                "status": m.status,
                                "joined_at": m.joined_at,
                                "source": m.source
                            }
                            for m in members
                        ]
            
            exported_characters.append(char_data)
        
        export_data = {
            "version": ImportExportService.CURRENT_VERSION,
            "export_time": datetime.utcnow().isoformat(),
            "export_type": "characters",
            "count": len(exported_characters),
            "data": exported_characters
        }
        
        logger.info(f"角色/组织导出完成: {len(exported_characters)} 个")
        return export_data
    
    @staticmethod
    async def import_characters(
        data: Dict,
        project_id: str,
        user_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        导入角色/组织卡片
        
        Args:
            data: 导入的JSON数据
            project_id: 目标项目ID
            user_id: 用户ID
            db: 数据库会话
            
        Returns:
            Dict: 导入结果
        """
        from app.models.career import CharacterCareer, Career
        
        warnings = []
        imported_characters = []
        imported_organizations = []
        skipped = []
        errors = []
        
        try:
            # 验证数据格式
            if "data" not in data:
                raise ValueError("导入数据格式错误：缺少data字段")
            
            characters_data = data["data"]
            if not isinstance(characters_data, list):
                raise ValueError("导入数据格式错误：data字段必须是数组")
            
            # 验证项目权限
            project_result = await db.execute(
                select(Project).where(
                    Project.id == project_id,
                    Project.user_id == user_id
                )
            )
            project = project_result.scalar_one_or_none()
            if not project:
                raise ValueError("项目不存在或无权访问")
            
            logger.info(f"开始导入 {len(characters_data)} 个角色/组织到项目 {project_id}")
            
            # 处理每个角色/组织
            for idx, char_data in enumerate(characters_data):
                try:
                    name = char_data.get("name")
                    if not name:
                        errors.append(f"第{idx+1}个角色缺少name字段")
                        continue
                    
                    # 检查重复名称（使用 first() 避免多行时报错）
                    existing_result = await db.execute(
                        select(Character).where(
                            Character.project_id == project_id,
                            Character.name == name
                        )
                    )
                    existing = existing_result.first()
                    
                    if existing:
                        warnings.append(f"角色'{name}'已存在，已跳过")
                        skipped.append(name)
                        continue
                    
                    # 处理traits
                    traits = char_data.get("traits")
                    if isinstance(traits, list):
                        traits = json.dumps(traits, ensure_ascii=False)
                    
                    is_organization = char_data.get("is_organization", False)
                    
                    # 创建角色
                    character = Character(
                        project_id=project_id,
                        name=name,
                        age=char_data.get("age"),
                        gender=char_data.get("gender"),
                        is_organization=is_organization,
                        role_type=char_data.get("role_type"),
                        personality=char_data.get("personality"),
                        background=char_data.get("background"),
                        appearance=char_data.get("appearance"),
                        traits=traits,
                        organization_type=char_data.get("organization_type"),
                        organization_purpose=char_data.get("organization_purpose"),
                        avatar_url=char_data.get("avatar_url"),
                        main_career_id=None,  # 职业ID需要验证后再设置
                        main_career_stage=char_data.get("main_career_stage"),
                        sub_careers=None  # 副职业需要验证后再设置
                    )
                    db.add(character)
                    await db.flush()  # 获取character.id
                    
                    # 处理主职业（如果有）
                    main_career_id = char_data.get("main_career_id")
                    main_career_stage = char_data.get("main_career_stage")
                    
                    if main_career_id and not is_organization:
                        # 验证职业是否存在
                        career_result = await db.execute(
                            select(Career).where(
                                Career.id == main_career_id,
                                Career.project_id == project_id,
                                Career.type == 'main'
                            )
                        )
                        career = career_result.scalar_one_or_none()
                        
                        if career:
                            character.main_career_id = main_career_id
                            character.main_career_stage = main_career_stage or 1
                            
                            # 创建职业关联
                            char_career = CharacterCareer(
                                character_id=character.id,
                                career_id=main_career_id,
                                career_type='main',
                                current_stage=main_career_stage or 1,
                                stage_progress=0
                            )
                            db.add(char_career)
                        else:
                            warnings.append(f"角色'{name}'的主职业ID不存在，已忽略职业信息")
                    
                    # 处理副职业（如果有）
                    sub_careers = char_data.get("sub_careers")
                    if sub_careers and not is_organization:
                        try:
                            sub_careers_data = json.loads(sub_careers) if isinstance(sub_careers, str) else sub_careers
                            
                            if isinstance(sub_careers_data, list):
                                valid_sub_careers = []
                                
                                for sub_data in sub_careers_data[:2]:  # 最多2个副职业
                                    if isinstance(sub_data, dict):
                                        career_id = sub_data.get('career_id')
                                        stage = sub_data.get('stage', 1)
                                        
                                        if career_id:
                                            # 验证副职业是否存在
                                            career_result = await db.execute(
                                                select(Career).where(
                                                    Career.id == career_id,
                                                    Career.project_id == project_id,
                                                    Career.type == 'sub'
                                                )
                                            )
                                            career = career_result.scalar_one_or_none()
                                            
                                            if career:
                                                valid_sub_careers.append({
                                                    'career_id': career_id,
                                                    'stage': stage
                                                })
                                                
                                                # 创建副职业关联
                                                char_career = CharacterCareer(
                                                    character_id=character.id,
                                                    career_id=career_id,
                                                    career_type='sub',
                                                    current_stage=stage,
                                                    stage_progress=0
                                                )
                                                db.add(char_career)
                                
                                if valid_sub_careers:
                                    character.sub_careers = json.dumps(valid_sub_careers, ensure_ascii=False)
                                elif sub_careers_data:
                                    warnings.append(f"角色'{name}'的副职业ID不存在，已忽略副职业信息")
                        except Exception as e:
                            warnings.append(f"角色'{name}'的副职业数据解析失败: {str(e)}")
                    
                    # 如果是组织，创建Organization记录
                    if is_organization:
                        organization = Organization(
                            character_id=character.id,
                            project_id=project_id,
                            member_count=0,
                            power_level=char_data.get("power_level", 50),
                            location=char_data.get("location"),
                            motto=char_data.get("motto"),
                            color=char_data.get("color")
                        )
                        db.add(organization)
                        await db.flush()
                        
                        # 导入组织成员数据（如果有）
                        members_data = char_data.get("organization_members_data", [])
                        if members_data and isinstance(members_data, list):
                            imported_member_count = 0
                            for m_data in members_data:
                                try:
                                    member_char_id = m_data.get("character_id")
                                    if not member_char_id:
                                        continue
                                    # 验证成员角色是否存在于目标项目
                                    member_char_result = await db.execute(
                                        select(Character).where(
                                            Character.id == member_char_id,
                                            Character.project_id == project_id
                                        )
                                    )
                                    if member_char_result.scalar_one_or_none():
                                        member = OrganizationMember(
                                            organization_id=organization.id,
                                            character_id=member_char_id,
                                            position=m_data.get("position", "成员"),
                                            rank=m_data.get("rank", 0),
                                            loyalty=m_data.get("loyalty", 50),
                                            contribution=m_data.get("contribution", 0),
                                            status=m_data.get("status", "active"),
                                            joined_at=m_data.get("joined_at"),
                                            source=m_data.get("source", "imported")
                                        )
                                        db.add(member)
                                        imported_member_count += 1
                                except Exception as me:
                                    logger.warning(f"导入组织成员失败: {str(me)}")
                            
                            if imported_member_count > 0:
                                organization.member_count = imported_member_count
                                logger.info(f"导入组织'{name}'的 {imported_member_count} 个成员")
                        
                        imported_organizations.append(name)
                    else:
                        imported_characters.append(name)
                    
                    logger.info(f"导入{'组织' if is_organization else '角色'}成功: {name}")
                    
                except Exception as e:
                    error_msg = f"导入角色'{char_data.get('name', f'第{idx+1}个')}'失败: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)
                    continue
            
            # 提交事务
            await db.commit()
            
            total = len(imported_characters) + len(imported_organizations)
            
            result = {
                "success": True,
                "message": f"成功导入 {total} 个角色/组织",
                "statistics": {
                    "total": len(characters_data),
                    "imported": total,
                    "skipped": len(skipped),
                    "errors": len(errors)
                },
                "details": {
                    "imported_characters": imported_characters,
                    "imported_organizations": imported_organizations,
                    "skipped": skipped,
                    "errors": errors
                },
                "warnings": warnings
            }
            
            logger.info(f"角色/组织导入完成: 成功{total}个，跳过{len(skipped)}个，失败{len(errors)}个")
            return result
            
        except Exception as e:
            await db.rollback()
            logger.error(f"导入角色/组织失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "message": f"导入失败: {str(e)}",
                "statistics": {
                    "total": len(characters_data) if "data" in data else 0,
                    "imported": len(imported_characters) + len(imported_organizations),
                    "skipped": len(skipped),
                    "errors": len(errors)
                },
                "details": {
                    "imported_characters": imported_characters,
                    "imported_organizations": imported_organizations,
                    "skipped": skipped,
                    "errors": errors
                },
                "warnings": warnings
            }
    
    @staticmethod
    def validate_characters_import(data: Dict) -> Dict[str, Any]:
        """
        验证角色/组织导入数据
        
        Args:
            data: 导入的JSON数据
            
        Returns:
            Dict: 验证结果
        """
        errors = []
        warnings = []
        
        # 检查版本
        version = data.get("version", "")
        if not version:
            errors.append("缺少版本信息")
        elif version not in ImportExportService.SUPPORTED_VERSIONS:
            warnings.append(f"版本不匹配: 导入文件版本为 {version}, 当前支持版本为 {', '.join(ImportExportService.SUPPORTED_VERSIONS)}")
        
        # 检查导出类型
        export_type = data.get("export_type", "")
        if export_type != "characters":
            errors.append(f"导出类型错误: 期望'characters'，实际'{export_type}'")
        
        # 检查数据字段
        if "data" not in data:
            errors.append("缺少data字段")
        elif not isinstance(data["data"], list):
            errors.append("data字段必须是数组")
        else:
            characters_data = data["data"]
            
            # 统计信息
            character_count = sum(1 for c in characters_data if not c.get("is_organization", False))
            org_count = sum(1 for c in characters_data if c.get("is_organization", False))
            
            # 检查必填字段
            for idx, char_data in enumerate(characters_data):
                if not char_data.get("name"):
                    errors.append(f"第{idx+1}个角色缺少name字段")
            
            statistics = {
                "characters": character_count,
                "organizations": org_count
            }
        
        if "data" not in data or errors:
            statistics = {"characters": 0, "organizations": 0}
        
        return {
            "valid": len(errors) == 0,
            "version": version,
            "statistics": statistics,
            "errors": errors,
            "warnings": warnings
        }
