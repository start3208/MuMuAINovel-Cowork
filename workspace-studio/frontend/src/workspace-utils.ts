import type { ProjectExportData, WorkspaceCharacter } from './types';

export function replaceItemByIndex<T>(items: T[], index: number, nextItem: T): T[] {
  return items.map((item, currentIndex) => (currentIndex === index ? nextItem : item));
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function projectStats(data: ProjectExportData) {
  return [
    { label: '大纲', value: data.outlines.length, unit: '条' },
    { label: '角色', value: data.characters.length, unit: '个' },
    { label: '章节', value: data.chapters.length, unit: '章' },
    { label: '伏笔', value: data.foreshadows.length, unit: '个' },
    { label: '已写', value: data.project.current_words || 0, unit: '字' },
  ];
}

export function normalizeTraits(value: WorkspaceCharacter['traits']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildEmptyCharacterRecord(name: string): WorkspaceCharacter {
  return {
    name,
    age: '',
    gender: '',
    is_organization: false,
    role_type: 'supporting',
    personality: '',
    background: '',
    appearance: '',
    relationships: '',
    traits: [],
    organization_type: '',
    organization_purpose: '',
    organization_members: '',
    avatar_url: '',
    main_career_id: '',
    main_career_stage: null as any,
    sub_careers: '',
    power_level: null as any,
    location: '',
    motto: '',
    color: '',
    created_at: '',
  };
}

function buildEmptyOrganizationCharacterRecord(name: string): WorkspaceCharacter {
  return {
    ...buildEmptyCharacterRecord(name),
    is_organization: true,
    organization_type: '组织',
    organization_purpose: '',
    organization_members: '',
  };
}

function buildEmptyOrganizationRecord(name: string): Record<string, any> {
  return {
    character_name: name,
    parent_org_name: '',
    power_level: null,
    member_count: 0,
    location: '',
    motto: '',
    color: '',
  };
}

function replaceExactName(value: unknown, oldName: string, newName: string): unknown {
  return value === oldName ? newName : value;
}

function replaceNameInStringArray(values: unknown, oldName: string, newName: string): unknown {
  if (!Array.isArray(values)) return values;
  return values
    .map((item) => (item === oldName ? newName : item))
    .filter((item) => item !== '');
}

function replaceNameInObjectKeys(values: unknown, oldName: string, newName: string): unknown {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return values;
  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>)
      .map(([key, value]) => [key === oldName ? newName : key, value] as const)
      .filter(([key]) => key !== ''),
  );
}

function updateOutlineStructureNames(structure: unknown, oldName: string, newName: string): unknown {
  if (!structure) return structure;
  let parsed: any;
  let isString = false;
  try {
    if (typeof structure === 'string') {
      parsed = JSON.parse(structure);
      isString = true;
    } else {
      parsed = cloneData(structure);
    }
  } catch {
    return structure;
  }
  if (Array.isArray(parsed?.characters)) {
    parsed.characters = parsed.characters
      .map((entry: any) =>
        entry && typeof entry === 'object'
          ? { ...entry, name: entry.name === oldName ? newName : entry.name }
          : entry === oldName
            ? newName
            : entry,
      )
      .filter((entry: any) => {
        if (entry && typeof entry === 'object') return entry.name !== '';
        return entry !== '';
      });
  }
  if (Array.isArray(parsed?.scenes)) {
    parsed.scenes = parsed.scenes.map((scene: any) =>
      scene && typeof scene === 'object'
        ? { ...scene, characters: replaceNameInStringArray(scene.characters, oldName, newName) }
        : scene,
    );
  }
  return isString ? JSON.stringify(parsed, null, 2) : parsed;
}

function updateExpansionPlanNames(expansionPlan: unknown, oldName: string, newName: string): unknown {
  if (!expansionPlan || typeof expansionPlan !== 'object' || Array.isArray(expansionPlan)) return expansionPlan;
  const nextPlan = cloneData(expansionPlan as Record<string, unknown>);
  if ('character_focus' in nextPlan) {
    nextPlan.character_focus = replaceNameInStringArray(nextPlan.character_focus, oldName, newName);
  }
  return nextPlan;
}

function updateStoryMemoryNames(memory: Record<string, any>, oldName: string, newName: string) {
  return {
    ...memory,
    related_characters: replaceNameInStringArray(memory.related_characters, oldName, newName),
  };
}

function updateForeshadowNames(foreshadow: Record<string, any>, oldName: string, newName: string) {
  return {
    ...foreshadow,
    related_characters: replaceNameInStringArray(foreshadow.related_characters, oldName, newName),
  };
}

function updatePlotAnalysisNames(analysis: Record<string, any>, oldName: string, newName: string) {
  return {
    ...analysis,
    character_states: Array.isArray(analysis.character_states)
      ? analysis.character_states.map((state: any) => ({
          ...state,
          character_name: state.character_name === oldName ? newName : state.character_name,
          relationship_changes: replaceNameInObjectKeys(state.relationship_changes, oldName, newName),
        }))
      : analysis.character_states,
    foreshadows: Array.isArray(analysis.foreshadows)
      ? analysis.foreshadows.map((item: any) => ({
          ...item,
          related_characters: replaceNameInStringArray(item.related_characters, oldName, newName),
        }))
      : analysis.foreshadows,
  };
}

function buildRelationshipSummary(data: ProjectExportData, characterName: string): string {
  const parts = (data.relationships || [])
    .filter((relationship: any) => relationship.source_name === characterName || relationship.target_name === characterName)
    .map((relationship: any) => {
      const targetName = relationship.source_name === characterName ? relationship.target_name : relationship.source_name;
      const relationshipName = relationship.relationship_name || '相关';
      return `与${targetName}：${relationshipName}`;
    });
  return parts.join('；');
}

function buildOrganizationMembersSummary(data: ProjectExportData, organizationName: string): string {
  const members = (data.organization_members || [])
    .filter((member: any) => member.organization_name === organizationName)
    .slice()
    .sort((left: any, right: any) => (right.rank ?? 0) - (left.rank ?? 0));
  if (members.length === 0) return '';
  const memberItems = members.map((member: any) => `${member.character_name}（${member.position || '成员'}）`);
  return JSON.stringify(memberItems, undefined, 0);
}

export function syncWorkspaceDerivedFields(data: ProjectExportData): ProjectExportData {
  const nextData = cloneData(data);
  const memberCounts = new Map<string, number>();
  (nextData.organization_members || []).forEach((member: any) => {
    memberCounts.set(member.organization_name, (memberCounts.get(member.organization_name) || 0) + 1);
  });

  nextData.organizations = (nextData.organizations || []).map((organization: any) => ({
    ...organization,
    member_count: memberCounts.get(organization.character_name) || 0,
  }));

  nextData.characters = (nextData.characters || []).map((character: any) => {
    const organization = (nextData.organizations || []).find((item: any) => item.character_name === character.name);
    return {
      ...character,
      relationships: buildRelationshipSummary(nextData, character.name),
      organization_members: character.is_organization ? buildOrganizationMembersSummary(nextData, character.name) : '',
      power_level: character.is_organization ? organization?.power_level ?? character.power_level : character.power_level,
      location: character.is_organization ? organization?.location ?? character.location : character.location,
      motto: character.is_organization ? organization?.motto ?? character.motto : character.motto,
      color: character.is_organization ? organization?.color ?? character.color : character.color,
    };
  }) as any;

  nextData.project.current_words = (nextData.chapters || []).reduce(
    (sum: number, chapter: any) => sum + (chapter.word_count || (chapter.content || '').length || 0),
    0,
  );

  return nextData;
}

export function ensureOutlineEntities(
  data: ProjectExportData,
  characterNames: string[],
  organizationNames: string[],
): { data: ProjectExportData; createdCharacters: string[]; createdOrganizations: string[] } {
  const nextData = cloneData(data);
  const existingCharacterNames = new Set((nextData.characters || []).map((item: any) => String(item.name || '')));
  const createdCharacters: string[] = [];
  const createdOrganizations: string[] = [];

  characterNames
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      if (existingCharacterNames.has(name)) return;
      nextData.characters.push(buildEmptyCharacterRecord(name) as any);
      existingCharacterNames.add(name);
      createdCharacters.push(name);
    });

  organizationNames
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      const existingCharacter = (nextData.characters || []).find((item: any) => item.name === name);
      if (!existingCharacter) {
        nextData.characters.push(buildEmptyOrganizationCharacterRecord(name) as any);
        createdOrganizations.push(name);
      } else if (!existingCharacter.is_organization) {
        return;
      }
      const hasOrganizationRecord = (nextData.organizations || []).some((item: any) => item.character_name === name);
      if (!hasOrganizationRecord) {
        nextData.organizations.push(buildEmptyOrganizationRecord(name) as any);
      }
    });

  return {
    data: syncWorkspaceDerivedFields(nextData),
    createdCharacters,
    createdOrganizations,
  };
}

function renameCharacterReferences(data: ProjectExportData, oldName: string, newName: string): ProjectExportData {
  const nextData = cloneData(data);
  nextData.relationships = nextData.relationships.map((relationship) => ({
    ...relationship,
    source_name: relationship.source_name === oldName ? newName : relationship.source_name,
    target_name: relationship.target_name === oldName ? newName : relationship.target_name,
  }));
  nextData.organization_members = nextData.organization_members.map((member) => ({
    ...member,
    organization_name: member.organization_name === oldName ? newName : member.organization_name,
    character_name: member.character_name === oldName ? newName : member.character_name,
  }));
  nextData.organizations = nextData.organizations.map((organization) => ({
    ...organization,
    character_name: organization.character_name === oldName ? newName : organization.character_name,
    parent_org_name: organization.parent_org_name === oldName ? newName : organization.parent_org_name,
  }));
  nextData.character_careers = nextData.character_careers.map((mapping) => ({
    ...mapping,
    character_name: mapping.character_name === oldName ? newName : mapping.character_name,
  }));
  nextData.foreshadows = nextData.foreshadows.map((foreshadow) => updateForeshadowNames(foreshadow, oldName, newName));
  nextData.story_memories = nextData.story_memories.map((memory) => updateStoryMemoryNames(memory, oldName, newName));
  nextData.outlines = nextData.outlines.map((outline) => ({
    ...outline,
    structure: updateOutlineStructureNames(outline.structure, oldName, newName),
  }));
  nextData.chapters = nextData.chapters.map((chapter) => ({
    ...chapter,
    expansion_plan: updateExpansionPlanNames(chapter.expansion_plan, oldName, newName),
  }));
  nextData.plot_analysis = nextData.plot_analysis.map((analysis) => updatePlotAnalysisNames(analysis, oldName, newName));
  return nextData;
}

function removeChapterLinkedData(nextData: ProjectExportData, chapterTitle: string): void {
  nextData.generation_history = nextData.generation_history.filter((history) => history.chapter_title !== chapterTitle);
  nextData.story_memories = nextData.story_memories.filter((memory) => memory.chapter_title !== chapterTitle);
  nextData.plot_analysis = nextData.plot_analysis.filter((analysis) => analysis.chapter_title !== chapterTitle);
}

function removeAnalysisForeshadowsForChapterTitles(
  sourceData: ProjectExportData,
  nextData: ProjectExportData,
  chapterTitles: string[],
): void {
  if (chapterTitles.length === 0) return;
  const chapterTitleSet = new Set(chapterTitles);
  const deletedChapterNumbers = new Set(
    (sourceData.chapters || [])
      .filter((chapter: any) => chapterTitleSet.has(chapter.title))
      .map((chapter: any) => chapter.chapter_number)
      .filter((value: any) => value !== null && value !== undefined),
  );
  const deletedMemoryIds = new Set(
    (sourceData.story_memories || [])
      .filter((memory: any) => chapterTitleSet.has(memory.chapter_title))
      .map((memory: any) => memory.id)
      .filter(Boolean),
  );

  nextData.foreshadows = nextData.foreshadows.filter((foreshadow: any) => {
    if (foreshadow.source_type !== 'analysis') return true;
    if (foreshadow.source_memory_id && deletedMemoryIds.has(foreshadow.source_memory_id)) return false;
    if (foreshadow.plant_chapter_number && deletedChapterNumbers.has(foreshadow.plant_chapter_number)) return false;
    if (foreshadow.actual_resolve_chapter_number && deletedChapterNumbers.has(foreshadow.actual_resolve_chapter_number)) return false;
    return true;
  });
}

export function getCareerUsageCount(data: ProjectExportData, careerName: string): number {
  return (data.character_careers || []).filter((mapping) => mapping.career_name === careerName).length;
}

export function updateCharacterAtIndex(
  data: ProjectExportData,
  index: number,
  nextCharacter: WorkspaceCharacter,
): ProjectExportData {
  let nextData = cloneData(data);
  const previous = nextData.characters[index] as WorkspaceCharacter | undefined;
  if (!previous) {
    return nextData;
  }

  const oldName = previous.name;
  const newName = nextCharacter.name;
  nextData.characters[index] = nextCharacter as any;

  if (nextCharacter.is_organization) {
    const existingOrgIndex = nextData.organizations.findIndex((item: any) => item.character_name === oldName);
    const nextOrgRecord = {
      ...(existingOrgIndex >= 0 ? nextData.organizations[existingOrgIndex] : {}),
      character_name: newName,
      power_level: nextCharacter.power_level ?? null,
      location: nextCharacter.location ?? '',
      motto: nextCharacter.motto ?? '',
      color: nextCharacter.color ?? '',
    };

    if (existingOrgIndex >= 0) {
      nextData.organizations[existingOrgIndex] = nextOrgRecord;
    } else {
      nextData.organizations.push({
        parent_org_name: '',
        member_count: 0,
        ...nextOrgRecord,
      } as any);
    }
  }

  if (oldName !== newName) {
    nextData = renameCharacterReferences(nextData, oldName, newName);
  }

  return syncWorkspaceDerivedFields(nextData);
}

export function deleteCharacterAtIndex(data: ProjectExportData, index: number): ProjectExportData {
  const nextData = cloneData(data);
  const current = nextData.characters[index] as WorkspaceCharacter | undefined;
  if (!current) {
    return nextData;
  }

  nextData.characters = nextData.characters.filter((_, currentIndex) => currentIndex !== index);
  nextData.relationships = nextData.relationships.filter(
    (relationship) => relationship.source_name !== current.name && relationship.target_name !== current.name,
  );
  nextData.organization_members = nextData.organization_members.filter(
    (member) => member.organization_name !== current.name && member.character_name !== current.name,
  );
  nextData.character_careers = nextData.character_careers.filter((mapping) => mapping.character_name !== current.name);
  nextData.foreshadows = nextData.foreshadows.map((foreshadow) => updateForeshadowNames(foreshadow, current.name, ''));
  nextData.foreshadows = nextData.foreshadows.map((foreshadow) => ({
    ...foreshadow,
    related_characters: Array.isArray(foreshadow.related_characters)
      ? foreshadow.related_characters.filter((name: string) => name !== '')
      : foreshadow.related_characters,
  }));
  nextData.story_memories = nextData.story_memories.map((memory) => ({
    ...updateStoryMemoryNames(memory, current.name, ''),
    related_characters: Array.isArray(memory.related_characters)
      ? memory.related_characters.filter((name: string) => name !== current.name)
      : memory.related_characters,
  }));
  nextData.outlines = nextData.outlines.map((outline) => ({
    ...outline,
    structure: updateOutlineStructureNames(outline.structure, current.name, ''),
  }));
  nextData.plot_analysis = nextData.plot_analysis.map((analysis) => ({
    ...updatePlotAnalysisNames(analysis, current.name, ''),
    character_states: Array.isArray(analysis.character_states)
      ? analysis.character_states.filter((state: any) => state.character_name !== current.name)
      : analysis.character_states,
  }));

  if (current.is_organization) {
    nextData.organizations = nextData.organizations.filter((organization) => organization.character_name !== current.name);
  }

  return syncWorkspaceDerivedFields(nextData);
}

export function updateCareerAtIndex(data: ProjectExportData, index: number, nextCareer: Record<string, any>): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.careers[index];
  if (!previous) {
    return nextData;
  }
  nextData.careers[index] = nextCareer;
  if (previous.name !== nextCareer.name) {
    nextData.character_careers = nextData.character_careers.map((mapping) => ({
      ...mapping,
      career_name: mapping.career_name === previous.name ? nextCareer.name : mapping.career_name,
    }));
  }
  return syncWorkspaceDerivedFields(nextData);
}

export function deleteCareerAtIndex(data: ProjectExportData, index: number): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.careers[index];
  if (!previous) {
    return nextData;
  }
  nextData.careers = nextData.careers.filter((_, currentIndex) => currentIndex !== index);
  nextData.character_careers = nextData.character_careers.filter((mapping) => mapping.career_name !== previous.name);
  return syncWorkspaceDerivedFields(nextData);
}

export function updateOutlineAtIndex(data: ProjectExportData, index: number, nextOutline: Record<string, any>): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.outlines[index];
  if (!previous) {
    return nextData;
  }
  nextData.outlines[index] = nextOutline;
  if (previous.title !== nextOutline.title) {
    nextData.chapters = nextData.chapters.map((chapter) => ({
      ...chapter,
      title:
        nextData.project.outline_mode === 'one-to-one' &&
        (chapter.chapter_number === nextOutline.order_index || chapter.outline_title === previous.title)
          ? nextOutline.title
          : chapter.title,
      outline_title: chapter.outline_title === previous.title ? nextOutline.title : chapter.outline_title,
    }));
  }
  return syncWorkspaceDerivedFields(nextData);
}

export function deleteOutlineAtIndex(data: ProjectExportData, index: number): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.outlines[index];
  if (!previous) {
    return nextData;
  }
  const removedChapterTitles = nextData.chapters
    .filter(
      (chapter) =>
        chapter.outline_title === previous.title ||
      (nextData.project.outline_mode === 'one-to-one' && chapter.chapter_number === previous.order_index),
    )
    .map((chapter) => chapter.title);
  removeAnalysisForeshadowsForChapterTitles(data, nextData, removedChapterTitles);
  nextData.outlines = nextData.outlines.filter((_, currentIndex) => currentIndex !== index);
  nextData.chapters = nextData.chapters.filter(
    (chapter) =>
      chapter.outline_title !== previous.title &&
      !(nextData.project.outline_mode === 'one-to-one' && chapter.chapter_number === previous.order_index),
  );
  removedChapterTitles.forEach((title) => removeChapterLinkedData(nextData, title));
  return syncWorkspaceDerivedFields(nextData);
}

export function updateChapterAtIndex(data: ProjectExportData, index: number, nextChapter: Record<string, any>): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.chapters[index];
  if (!previous) {
    return nextData;
  }
  nextData.chapters[index] = nextChapter;
  if (previous.title !== nextChapter.title) {
    nextData.generation_history = nextData.generation_history.map((history) => ({
      ...history,
      chapter_title: history.chapter_title === previous.title ? nextChapter.title : history.chapter_title,
    }));
    nextData.story_memories = nextData.story_memories.map((memory) => ({
      ...memory,
      chapter_title: memory.chapter_title === previous.title ? nextChapter.title : memory.chapter_title,
    }));
    nextData.plot_analysis = nextData.plot_analysis.map((analysis) => ({
      ...analysis,
      chapter_title: analysis.chapter_title === previous.title ? nextChapter.title : analysis.chapter_title,
    }));
  }
  if (!nextChapter.content || String(nextChapter.content).trim() === '') {
    removeAnalysisForeshadowsForChapterTitles(data, nextData, [previous.title]);
    nextData.chapters[index] = {
      ...nextData.chapters[index],
      status: 'draft',
      word_count: 0,
    };
    removeChapterLinkedData(nextData, nextChapter.title);
  }
  return syncWorkspaceDerivedFields(nextData);
}

export function deleteChapterAtIndex(data: ProjectExportData, index: number): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.chapters[index];
  if (!previous) {
    return nextData;
  }
  removeAnalysisForeshadowsForChapterTitles(data, nextData, [previous.title]);
  nextData.chapters = nextData.chapters.filter((_, currentIndex) => currentIndex !== index);
  removeChapterLinkedData(nextData, previous.title);
  return syncWorkspaceDerivedFields(nextData);
}

export function updateRelationships(nextData: ProjectExportData, relationships: Array<Record<string, any>>): ProjectExportData {
  const cloned = cloneData(nextData);
  cloned.relationships = relationships as any;
  return syncWorkspaceDerivedFields(cloned);
}

export function updateOrganizationMembers(nextData: ProjectExportData, members: Array<Record<string, any>>): ProjectExportData {
  const cloned = cloneData(nextData);
  cloned.organization_members = members as any;
  return syncWorkspaceDerivedFields(cloned);
}

export function updateOrganizations(nextData: ProjectExportData, organizations: Array<Record<string, any>>): ProjectExportData {
  const cloned = cloneData(nextData);
  cloned.organizations = organizations as any;
  return syncWorkspaceDerivedFields(cloned);
}

export function updateForeshadowAtIndex(data: ProjectExportData, index: number, nextForeshadow: Record<string, any>): ProjectExportData {
  const nextData = cloneData(data);
  nextData.foreshadows[index] = nextForeshadow;
  return syncWorkspaceDerivedFields(nextData);
}

export function updateWritingStyleAtIndex(data: ProjectExportData, index: number, nextStyle: Record<string, any>): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.writing_styles[index];
  if (!previous) {
    return nextData;
  }
  nextData.writing_styles[index] = nextStyle;
  if (previous.name !== nextStyle.name && nextData.project_default_style?.style_name === previous.name) {
    nextData.project_default_style = {
      ...nextData.project_default_style,
      style_name: nextStyle.name,
    };
  }
  return syncWorkspaceDerivedFields(nextData);
}

export function deleteWritingStyleAtIndex(data: ProjectExportData, index: number): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.writing_styles[index];
  if (!previous) {
    return nextData;
  }
  nextData.writing_styles = nextData.writing_styles.filter((_, currentIndex) => currentIndex !== index);
  if (nextData.project_default_style?.style_name === previous.name) {
    nextData.project_default_style = null as any;
  }
  return syncWorkspaceDerivedFields(nextData);
}

export function setDefaultWritingStyle(data: ProjectExportData, styleName: string | null): ProjectExportData {
  const nextData = cloneData(data);
  nextData.project_default_style = styleName ? ({ style_name: styleName } as any) : null;
  return syncWorkspaceDerivedFields(nextData);
}
