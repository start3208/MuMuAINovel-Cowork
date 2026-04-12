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

export function updateCharacterAtIndex(
  data: ProjectExportData,
  index: number,
  nextCharacter: WorkspaceCharacter,
): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.characters[index] as WorkspaceCharacter | undefined;
  if (!previous) {
    return nextData;
  }

  const oldName = previous.name;
  const newName = nextCharacter.name;
  nextData.characters[index] = nextCharacter as any;

  if (oldName !== newName) {
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
    nextData.foreshadows = nextData.foreshadows.map((foreshadow) => ({
      ...foreshadow,
      related_characters: Array.isArray(foreshadow.related_characters)
        ? foreshadow.related_characters.map((name: string) => (name === oldName ? newName : name))
        : foreshadow.related_characters,
    }));
  }

  return nextData;
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
  nextData.foreshadows = nextData.foreshadows.map((foreshadow) => ({
    ...foreshadow,
    related_characters: Array.isArray(foreshadow.related_characters)
      ? foreshadow.related_characters.filter((name: string) => name !== current.name)
      : foreshadow.related_characters,
  }));

  if (current.is_organization) {
    nextData.organizations = nextData.organizations.filter((organization) => organization.character_name !== current.name);
  }

  return nextData;
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
  return nextData;
}

export function deleteCareerAtIndex(data: ProjectExportData, index: number): ProjectExportData {
  const nextData = cloneData(data);
  const previous = nextData.careers[index];
  if (!previous) {
    return nextData;
  }
  nextData.careers = nextData.careers.filter((_, currentIndex) => currentIndex !== index);
  nextData.character_careers = nextData.character_careers.filter((mapping) => mapping.career_name !== previous.name);
  return nextData;
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
      outline_title: chapter.outline_title === previous.title ? nextOutline.title : chapter.outline_title,
    }));
  }
  return nextData;
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
  return nextData;
}

export function updateForeshadowAtIndex(data: ProjectExportData, index: number, nextForeshadow: Record<string, any>): ProjectExportData {
  const nextData = cloneData(data);
  nextData.foreshadows[index] = nextForeshadow;
  return nextData;
}
