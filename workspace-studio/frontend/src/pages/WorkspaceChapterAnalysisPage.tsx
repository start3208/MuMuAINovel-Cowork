import { useMemo, useState } from 'react';
import { Card, Empty, List, Progress, Space, Tag, Typography } from 'antd';
import { FundOutlined } from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';

const { Title, Paragraph, Text } = Typography;

export default function WorkspaceChapterAnalysisPage() {
  const { data } = useWorkspaceContext();
  const analyses = data.plot_analysis || [];
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selected = analyses[selectedIndex];

  const summaryTags = useMemo(() => {
    if (!selected) return [];
    return [
      { color: 'blue', text: `钩子 ${selected.hooks_count || 0}` },
      { color: 'gold', text: `伏笔 ${selected.foreshadows_planted || 0}` },
      { color: 'green', text: `回收 ${selected.foreshadows_resolved || 0}` },
      { color: 'purple', text: `冲突 ${selected.conflict_level || 0}` },
      { color: 'cyan', text: `情节点 ${selected.plot_points_count || 0}` },
    ];
  }, [selected]);

  if (analyses.length === 0) {
    return <Empty description="当前工作区没有剧情分析数据" />;
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <Card className="studio-card" title="章节列表" style={{ width: 320 }}>
        <List
          dataSource={analyses}
          renderItem={(item: any, index) => (
            <List.Item
              style={{
                cursor: 'pointer',
                borderRadius: 12,
                paddingInline: 12,
                background: index === selectedIndex ? 'rgba(31,111,95,0.08)' : 'transparent',
              }}
              onClick={() => setSelectedIndex(index)}
            >
              <List.Item.Meta
                title={item.chapter_title}
                description={`${item.plot_stage || '未设阶段'} | ${item.emotional_tone || '未设情感'}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card className="studio-card" style={{ flex: 1 }}>
        {selected ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <Title level={3} style={{ marginBottom: 0 }}>
                <FundOutlined style={{ marginRight: 8 }} />
                {selected.chapter_title}
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                阶段：{selected.plot_stage || '未设置'} | 情感基调：{selected.emotional_tone || '未设置'} | 节奏：{selected.pacing || '未设置'}
              </Paragraph>
            </div>

            <Space wrap>
              {summaryTags.map((tag) => (
                <Tag key={tag.text} color={tag.color}>
                  {tag.text}
                </Tag>
              ))}
            </Space>

            <Card size="small" title="质量评分">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <Text strong>整体质量</Text>
                  <Progress percent={Math.round((selected.overall_quality_score || 0) * 10)} />
                </div>
                <div>
                  <Text strong>节奏评分</Text>
                  <Progress percent={Math.round((selected.pacing_score || 0) * 10)} />
                </div>
                <div>
                  <Text strong>吸引力评分</Text>
                  <Progress percent={Math.round((selected.engagement_score || 0) * 10)} />
                </div>
              </Space>
            </Card>

            {selected.analysis_report && (
              <Card size="small" title="分析报告">
                <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{selected.analysis_report}</Paragraph>
              </Card>
            )}

            {Array.isArray(selected.suggestions) && selected.suggestions.length > 0 && (
              <Card size="small" title="改进建议">
                <List size="small" dataSource={selected.suggestions} renderItem={(item: string) => <List.Item>{item}</List.Item>} />
              </Card>
            )}
          </Space>
        ) : null}
      </Card>
    </div>
  );
}
