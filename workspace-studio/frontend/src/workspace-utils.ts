import type { ProjectExportData } from './types';

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
