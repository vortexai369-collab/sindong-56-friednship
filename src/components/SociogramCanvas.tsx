import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  PinOff,
  RotateCcw,
  Save,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ClassAnalytics,
  NEGATIVE_RELATION_TAGS,
  POSITIVE_RELATION_TAGS,
  SociogramEdge,
  SociometricType,
  Student,
  Survey,
  SurveyResponse,
} from '../types';
import { computeClassAnalytics, detectFriendClusters } from '../utils/sociometry';

interface SociogramCanvasProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
  onSaveMemo: (studentId: string, memo: string) => Promise<void>;
  onViewStudentResponse?: (studentId: string) => void;
}

type LayoutMode = 'force' | 'target' | 'circle';
type ColorMode = 'gender' | 'closeness' | 'type' | 'cluster';
type EgoDirectionFilter = 'both' | 'incoming' | 'outgoing';

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  number: number;
  name: string;
  gender: '남' | '여';
  positiveIn: number;
  positiveOut: number;
  negativeIn: number;
  mutualCount: number;
  avgClosenessReceived: number | null;
  avgClosenessGiven: number | null;
  sociometricType: SociometricType;
  responded: boolean;
  clusterColor: string;
  pinned?: boolean;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  type: SociogramEdge['type'];
  weight: number;
  maxScore: number;
  minScore: number;
  questionIds: string[];
}

interface HoverTooltip {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  detail: string;
}

const TYPE_COLOR: Record<SociometricType, string> = {
  인기형: '#059669',
  평균형: '#2563EB',
  '고립·관심형': '#D97706',
  '갈등·주의형': '#DC2626',
  양면형: '#7C3AED',
  미분류: '#64748B',
};

function getClosenessNodeColor(avg: number | null): string {
  if (avg === null) return '#94A3B8';
  if (avg >= 0.45) return '#059669';
  if (avg >= 0.1) return '#2563EB';
  if (avg > -0.15) return '#64748B';
  if (avg > -0.45) return '#D97706';
  return '#DC2626';
}

export const SociogramCanvas: React.FC<SociogramCanvasProps> = ({
  survey,
  students,
  responses,
  onSaveMemo,
  onViewStudentResponse,
}) => {
  const [questionFilter, setQuestionFilter] = useState<string>('all');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [colorBy, setColorBy] = useState<ColorMode>('gender');
  const [mutualOnly, setMutualOnly] = useState<boolean>(false);
  const [showConflict, setShowConflict] = useState<boolean>(true);
  const [highlightAttention, setHighlightAttention] = useState<boolean>(true);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [egoDirection, setEgoDirection] = useState<EgoDirectionFilter>('both');
  const [searchStudentId, setSearchStudentId] = useState<string>('');
  const [layoutSeed, setLayoutSeed] = useState<number>(0);
  const [pinnedCount, setPinnedCount] = useState<number>(0);
  const [tooltip, setTooltip] = useState<HoverTooltip | null>(null);

  // Memo editing state for selected student
  const [memoDraft, setMemoDraft] = useState<string>('');
  const [savingMemo, setSavingMemo] = useState<boolean>(false);
  const [memoSavedNotice, setMemoSavedNotice] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  const analytics: ClassAnalytics = useMemo(
    () => computeClassAnalytics(students, responses, questionFilter),
    [students, responses, questionFilter]
  );

  const clusters = useMemo(() => detectFriendClusters(analytics), [analytics]);

  const clusterColorByStudentId = useMemo(() => {
    const map: Record<string, string> = {};
    clusters.forEach((c) => {
      c.memberIds.forEach((id) => {
        map[id] = c.color;
      });
    });
    return map;
  }, [clusters]);

  const questionLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    survey.questions.forEach((q, i) => {
      map[q.id] = `Q${i + 1}`;
    });
    return map;
  }, [survey.questions]);

  const visibleEdges = useMemo(() => {
    return analytics.edges.filter((edge) => {
      if (edge.type === 'negative') return showConflict && !mutualOnly;
      if (mutualOnly) return edge.type === 'mutual';
      return true;
    });
  }, [analytics.edges, mutualOnly, showConflict]);

  const selectedMetric = selectedStudentId ? analytics.metricsById[selectedStudentId] : null;
  const activeCluster = selectedClusterId
    ? clusters.find((c) => c.id === selectedClusterId) || null
    : null;

  useEffect(() => {
    if (selectedMetric) {
      setMemoDraft(selectedMetric.student.memo || '');
      setMemoSavedNotice(false);
    }
  }, [selectedStudentId, selectedMetric?.student.memo]);

  const focusNodeInView = (studentId: string) => {
    const svgEl = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svgEl || !zoom) return;
    const node = nodesRef.current.find((n) => n.id === studentId);
    if (!node || node.x == null || node.y == null) return;
    const width = svgEl.clientWidth || 780;
    const height = svgEl.clientHeight || 560;
    const scale = 1.25;
    const tx = width / 2 - node.x * scale;
    const ty = height / 2 - node.y * scale;
    d3.select(svgEl)
      .transition()
      .duration(350)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };

  // Build & run D3 Sociogram Visualization
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || students.length === 0) return;

    const width = svgEl.clientWidth || 780;
    const height = svgEl.clientHeight || 560;
    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    setPinnedCount(0);

    const defs = svg.append('defs');

    // Arrowheads by closeness level
    const markerSpecs = [
      { id: 'socio-arrow-pos2', fill: '#2563EB' },
      { id: 'socio-arrow-pos', fill: '#94A3B8' },
      { id: 'socio-arrow-neg1', fill: '#D97706' },
      { id: 'socio-arrow-neg', fill: '#DC2626' },
    ];
    markerSpecs.forEach((m) => {
      defs
        .append('marker')
        .attr('id', m.id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L9,0L0,4Z')
        .attr('fill', m.fill);
    });

    const rootG = svg.append('g').attr('class', 'sociogram-root');

    // Target Sociogram Concentric Rings (Moreno / Bronfenbrenner 표적 소시오그램)
    if (layoutMode === 'target') {
      const ringsGroup = rootG.append('g').attr('class', 'target-rings');
      const rInner = minDim * 0.16;
      const rMid = minDim * 0.31;
      const rOuter = minDim * 0.44;
      const rings =
        colorBy === 'closeness'
          ? [
              { r: rOuter, label: '친밀도 낮음 · 주의권', fill: 'rgba(254, 242, 242, 0.45)' },
              { r: rMid, label: '친밀도 보통권', fill: 'rgba(241, 245, 249, 0.55)' },
              { r: rInner, label: '친밀도 높음 (핵심권)', fill: 'rgba(236, 253, 245, 0.6)' },
            ]
          : [
              { r: rOuter, label: '주변·관심 필요권', fill: 'rgba(248, 250, 252, 0.7)' },
              { r: rMid, label: '일반 관계권', fill: 'rgba(241, 245, 249, 0.55)' },
              { r: rInner, label: '핵심 인기권', fill: 'rgba(236, 253, 245, 0.55)' },
            ];

      rings.forEach((ring) => {
        ringsGroup
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', ring.r)
          .attr('fill', ring.fill)
          .attr('stroke', '#CBD5E1')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,4');

        ringsGroup
          .append('text')
          .attr('x', cx)
          .attr('y', cy - ring.r + 14)
          .attr('text-anchor', 'middle')
          .attr('fill', '#64748B')
          .attr('font-size', '10px')
          .attr('font-weight', '500')
          .style('pointer-events', 'none')
          .text(ring.label);
      });
    }

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.8])
      .on('zoom', (event) => {
        rootG.attr('transform', event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    svg.on('click', (event) => {
      if (event.target === svgEl) {
        setSelectedStudentId(null);
        setSelectedClusterId(null);
        setSearchStudentId('');
      }
    });

    const nodeRadius = (d: SimNode) => Math.min(27, 15 + d.positiveIn * 2.1);

    // Prepare nodes with initial layout coordinates
    const maxPosIn = Math.max(1, ...analytics.metricsList.map((m) => m.positiveIn));
    const orderedMetrics = [...analytics.metricsList].sort(
      (a, b) => a.student.number - b.student.number
    );

    const nodes: SimNode[] = orderedMetrics.map((m, idx) => {
      let initX = cx + (Math.random() - 0.5) * 140;
      let initY = cy + (Math.random() - 0.5) * 140;

      if (layoutMode === 'circle') {
        const angle = (2 * Math.PI * idx) / orderedMetrics.length - Math.PI / 2;
        const radius = minDim * 0.39;
        initX = cx + radius * Math.cos(angle);
        initY = cy + radius * Math.sin(angle);
      } else if (layoutMode === 'target') {
        let ringRadius = minDim * 0.39;
        if (colorBy === 'closeness' && m.avgClosenessReceived !== null) {
          ringRadius =
            m.avgClosenessReceived >= 0.4
              ? minDim * 0.11
              : m.avgClosenessReceived >= 0
              ? minDim * 0.25
              : minDim * 0.39;
        } else {
          const ratio = m.positiveIn / maxPosIn;
          ringRadius =
            ratio >= 0.65
              ? minDim * 0.11
              : ratio >= 0.3
              ? minDim * 0.25
              : minDim * 0.39;
        }
        const angle = (2 * Math.PI * idx) / orderedMetrics.length - Math.PI / 2;
        initX = cx + ringRadius * Math.cos(angle);
        initY = cy + ringRadius * Math.sin(angle);
      }

      return {
        id: m.student.id,
        number: m.student.number,
        name: m.student.name,
        gender: m.student.gender,
        positiveIn: m.positiveIn,
        positiveOut: m.positiveOut,
        negativeIn: m.negativeIn,
        mutualCount: m.mutualIds.length,
        avgClosenessReceived: m.avgClosenessReceived,
        avgClosenessGiven: m.avgClosenessGiven,
        sociometricType: m.sociometricType,
        responded: m.responded,
        clusterColor: clusterColorByStudentId[m.student.id] || '#94A3B8',
        x: initX,
        y: initY,
        fx: layoutMode === 'circle' ? initX : undefined,
        fy: layoutMode === 'circle' ? initY : undefined,
      };
    });

    nodesRef.current = nodes;

    const links: SimLink[] = visibleEdges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      weight: e.weight,
      maxScore: e.maxScore,
      minScore: e.minScore,
      questionIds: e.questionIds,
    }));

    const simulation = d3.forceSimulation<SimNode>(nodes);
    simulationRef.current = simulation;

    if (layoutMode === 'force') {
      simulation
        .force(
          'link',
          d3
            .forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance((l) =>
              l.type === 'mutual'
                ? l.minScore === 2
                  ? 82
                  : 105
                : l.type === 'positive'
                ? l.maxScore === 2
                  ? 128
                  : 152
                : 190
            )
            .strength((l) =>
              l.type === 'mutual'
                ? l.minScore === 2
                  ? 0.68
                  : 0.45
                : l.type === 'positive'
                ? 0.22
                : 0.06
            )
        )
        .force('charge', d3.forceManyBody<SimNode>().strength(-360))
        .force('center', d3.forceCenter(cx, cy))
        .force(
          'collide',
          d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 24)
        );
    } else if (layoutMode === 'target') {
      simulation
        .force(
          'link',
          d3
            .forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .strength(0.05)
        )
        .force(
          'radial',
          d3
            .forceRadial<SimNode>(
              (d) => {
                if (colorBy === 'closeness' && d.avgClosenessReceived !== null) {
                  if (d.avgClosenessReceived >= 0.4) return minDim * 0.1;
                  if (d.avgClosenessReceived >= 0) return minDim * 0.24;
                  return minDim * 0.39;
                }
                const ratio = d.positiveIn / maxPosIn;
                if (ratio >= 0.65) return minDim * 0.1;
                if (ratio >= 0.3) return minDim * 0.24;
                return minDim * 0.39;
              },
              cx,
              cy
            )
            .strength(0.85)
        )
        .force('charge', d3.forceManyBody<SimNode>().strength(-140))
        .force(
          'collide',
          d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 20)
        );
    } else {
      // Circular mode: keep links resolved without altering fixed circle coordinates
      simulation
        .force(
          'link',
          d3
            .forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .strength(0)
        )
        .alpha(0.05);
    }

    const updateTooltipPos = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 16, y: 16 };
      const rawX = event.clientX - rect.left + 14;
      const rawY = event.clientY - rect.top - 12;
      return {
        x: Math.min(rect.width - 230, Math.max(12, rawX)),
        y: Math.min(rect.height - 96, Math.max(12, rawY)),
      };
    };

    // Draw edges
    const linkGroup = rootG.append('g').attr('class', 'links');
    const linkSelection = linkGroup
      .selectAll<SVGPathElement, SimLink>('path')
      .data(links)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => {
        if (d.type === 'mutual') return d.minScore === 2 ? '#059669' : '#0EA5E9';
        if (d.type === 'negative') return d.minScore === -2 ? '#DC2626' : '#D97706';
        return d.maxScore === 2 ? '#2563EB' : '#94A3B8';
      })
      .attr('stroke-width', (d) => {
        if (d.type === 'mutual') return d.minScore === 2 ? 3.8 : 2.3;
        if (d.type === 'negative') return d.minScore === -2 ? 2.1 : 1.5;
        return d.maxScore === 2 ? 2.2 : 1.4;
      })
      .attr('stroke-dasharray', (d) =>
        d.type === 'negative' ? (d.minScore === -2 ? '5,3' : '4,4') : null
      )
      .attr('marker-end', (d) => {
        if (d.type === 'positive') {
          return d.maxScore === 2 ? 'url(#socio-arrow-pos2)' : 'url(#socio-arrow-pos)';
        }
        if (d.type === 'negative') {
          return d.minScore === -2 ? 'url(#socio-arrow-neg)' : 'url(#socio-arrow-neg1)';
        }
        return null;
      })
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const matchedEdge = visibleEdges.find(
          (e) =>
            (e.source === s.id && e.target === t.id) ||
            (d.type === 'mutual' && e.source === t.id && e.target === s.id)
        );
        const tagText = matchedEdge?.tags?.length
          ? matchedEdge.tags.map((tg) => `#${tg}`).join(' ')
          : '';
        const qNames = d.questionIds.map((id) => questionLabelMap[id] || id).join(', ');
        const pos = updateTooltipPos(event);
        setTooltip({
          x: pos.x,
          y: pos.y,
          title:
            d.type === 'mutual'
              ? `${s.name} ↔ ${t.name}`
              : `${s.name} → ${t.name}`,
          subtitle:
            d.type === 'mutual'
              ? d.minScore === 2
                ? '핵심 단짝 (+2 ↔ +2)'
                : d.maxScore === 2
                ? '상호 우호 (+2 ↔ +1)'
                : '상호 우호 (+1 ↔ +1)'
              : d.type === 'negative'
              ? d.minScore === -2
                ? '불편함·갈등 (-2)'
                : '조금 어색함 (-1)'
              : d.maxScore === 2
              ? '일방 매우 친함 (+2)'
              : '일방 친한 편 (+1)',
          detail: tagText || `문항: ${qNames}`,
        });
      })
      .on('mousemove', (event) => {
        const pos = updateTooltipPos(event);
        setTooltip((prev) => (prev ? { ...prev, x: pos.x, y: pos.y } : null));
      })
      .on('mouseleave', () => setTooltip(null));

    // Draw nodes
    const nodeGroup = rootG.append('g').attr('class', 'nodes');
    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-item')
      .style('cursor', 'grab')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedClusterId(null);
        setSelectedStudentId((prev) => (prev === d.id ? null : d.id));
        setSearchStudentId(d.id);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        if (layoutMode !== 'circle' && d.pinned) {
          d.fx = null;
          d.fy = null;
          d.pinned = false;
          setPinnedCount(nodes.filter((n) => n.pinned).length);
          simulation.alpha(0.3).restart();
        }
      })
      .on('mouseenter', (event, d) => {
        const pos = updateTooltipPos(event);
        const avgStr =
          d.avgClosenessReceived !== null
            ? `${d.avgClosenessReceived > 0 ? '+' : ''}${d.avgClosenessReceived.toFixed(2)}`
            : '—';
        setTooltip({
          x: pos.x,
          y: pos.y,
          title: `${d.number}번 ${d.name} (${d.gender})`,
          subtitle: `${d.sociometricType} · 평균친밀 ${avgStr}`,
          detail: `긍정받음 ${d.positiveIn} · 상호 ${d.mutualCount} · 불편·어색 ${d.negativeIn}`,
        });
      })
      .on('mousemove', (event) => {
        const pos = updateTooltipPos(event);
        setTooltip((prev) => (prev ? { ...prev, x: pos.x, y: pos.y } : null));
      })
      .on('mouseleave', () => setTooltip(null));

    // Optional Attention Halo Ring for isolated/conflict students
    nodeSelection
      .append('circle')
      .attr('class', 'attention-ring')
      .attr('r', (d) => nodeRadius(d) + 5)
      .attr('fill', 'none')
      .attr('stroke', (d) =>
        d.sociometricType === '갈등·주의형'
          ? '#DC2626'
          : d.sociometricType === '고립·관심형'
          ? '#D97706'
          : 'none'
      )
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,2')
      .attr('opacity', highlightAttention ? 0.85 : 0);

    // Main Node Circle
    nodeSelection
      .append('circle')
      .attr('class', 'node-core')
      .attr('r', (d) => nodeRadius(d))
      .attr('fill', (d) => {
        if (colorBy === 'closeness') return getClosenessNodeColor(d.avgClosenessReceived);
        if (colorBy === 'type') return TYPE_COLOR[d.sociometricType];
        if (colorBy === 'cluster') return d.clusterColor;
        return d.gender === '남' ? '#2563EB' : '#DB2777';
      })
      .attr('stroke', (d) => (d.responded ? '#FFFFFF' : '#CBD5E1'))
      .attr('stroke-width', (d) => (d.responded ? 2.5 : 2))
      .attr('stroke-dasharray', (d) => (d.responded ? null : '3,2'));

    // Pin indicator dot (only shown when user manually pinned the node)
    nodeSelection
      .append('circle')
      .attr('class', 'pin-indicator')
      .attr('cx', (d) => nodeRadius(d) * 0.72)
      .attr('cy', (d) => -nodeRadius(d) * 0.72)
      .attr('r', 3.5)
      .attr('fill', '#0F172A')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 1.2)
      .attr('opacity', 0);

    // Attendance number inside node
    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#FFFFFF')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .style('pointer-events', 'none')
      .text((d) => d.number);

    // Name label with clean white halo for crisp readability over edges
    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => nodeRadius(d) + 15)
      .attr('fill', '#0F172A')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .style('pointer-events', 'none')
      .text((d) => d.name);

    // Sticky Drag Behavior (pins dragged node; double-click to release)
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active && layoutMode !== 'circle') {
          simulation.alphaTarget(0.22).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
        if (layoutMode === 'circle') {
          d.x = event.x;
          d.y = event.y;
          renderPositions();
        }
      })
      .on('end', (event, d) => {
        if (!event.active && layoutMode !== 'circle') {
          simulation.alphaTarget(0);
        }
        d.pinned = true;
        setPinnedCount(nodes.filter((n) => n.pinned).length);
        d3.select(event.sourceEvent?.target?.parentNode)
          .select('.pin-indicator')
          .attr('opacity', 1);
      });

    nodeSelection.call(drag);

    // Edge path calculation trimmed accurately to target node circumference so arrowheads never hide under nodes
    const renderPositions = () => {
      linkSelection.attr('d', (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const sx = s.x ?? 0;
        const sy = s.y ?? 0;
        const tx = t.x ?? 0;
        const ty = t.y ?? 0;
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sr = nodeRadius(s) + 2;
        const tr = nodeRadius(t) + (d.type === 'mutual' ? 2 : 6);

        const startX = sx + (dx / dist) * sr;
        const startY = sy + (dy / dist) * sr;
        const endX = tx - (dx / dist) * tr;
        const endY = ty - (dy / dist) * tr;

        if (d.type === 'mutual') {
          return `M${startX},${startY}L${endX},${endY}`;
        }
        const curveRadius = dist * 1.45;
        return `M${startX},${startY}A${curveRadius},${curveRadius} 0 0,1 ${endX},${endY}`;
      });

      nodeSelection.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    simulation.on('tick', renderPositions);
    renderPositions();

    return () => {
      simulation.stop();
    };
  }, [
    analytics.metricsList,
    visibleEdges,
    layoutMode,
    colorBy,
    highlightAttention,
    layoutSeed,
    students.length,
    clusterColorByStudentId,
    questionLabelMap,
  ]);

  // Update highlighting when selected student, ego direction, or selected cluster changes
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);

    if (activeCluster) {
      const memberSet = new Set(activeCluster.memberIds);
      svg
        .selectAll<SVGGElement, SimNode>('.node-item')
        .attr('opacity', (d) => (memberSet.has(d.id) ? 1 : 0.16));
      svg
        .selectAll<SVGPathElement, SimLink>('.links path')
        .attr('opacity', (d) => {
          const sid = typeof d.source === 'string' ? d.source : d.source.id;
          const tid = typeof d.target === 'string' ? d.target : d.target.id;
          return memberSet.has(sid) && memberSet.has(tid) ? 0.95 : 0.06;
        });
      return;
    }

    if (!selectedStudentId) {
      svg.selectAll('.node-item').attr('opacity', 1);
      svg.selectAll('.links path').attr('opacity', 0.82);
      svg
        .selectAll<SVGCircleElement, SimNode>('.node-core')
        .attr('stroke', (d) => (d.responded ? '#FFFFFF' : '#CBD5E1'))
        .attr('stroke-width', (d) => (d.responded ? 2.5 : 2));
      return;
    }

    const activeNeighborIds = new Set<string>([selectedStudentId]);
    const isEdgeRelevant = (sid: string, tid: string, type: SociogramEdge['type']) => {
      if (type === 'mutual') {
        return sid === selectedStudentId || tid === selectedStudentId;
      }
      if (egoDirection === 'incoming') return tid === selectedStudentId;
      if (egoDirection === 'outgoing') return sid === selectedStudentId;
      return sid === selectedStudentId || tid === selectedStudentId;
    };

    visibleEdges.forEach((e) => {
      if (isEdgeRelevant(e.source, e.target, e.type)) {
        activeNeighborIds.add(e.source);
        activeNeighborIds.add(e.target);
      }
    });

    svg
      .selectAll<SVGGElement, SimNode>('.node-item')
      .attr('opacity', (d) => (activeNeighborIds.has(d.id) ? 1 : 0.16));

    svg
      .selectAll<SVGCircleElement, SimNode>('.node-core')
      .attr('stroke', (d) =>
        d.id === selectedStudentId ? '#0F172A' : d.responded ? '#FFFFFF' : '#CBD5E1'
      )
      .attr('stroke-width', (d) => (d.id === selectedStudentId ? 4 : 2.5));

    svg
      .selectAll<SVGPathElement, SimLink>('.links path')
      .attr('opacity', (d) => {
        const sid = typeof d.source === 'string' ? d.source : d.source.id;
        const tid = typeof d.target === 'string' ? d.target : d.target.id;
        return isEdgeRelevant(sid, tid, d.type) ? 0.96 : 0.06;
      });
  }, [selectedStudentId, egoDirection, activeCluster, visibleEdges]);

  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(180)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleUnpinAll = () => {
    nodesRef.current.forEach((n) => {
      if (layoutMode !== 'circle') {
        n.fx = null;
        n.fy = null;
      }
      n.pinned = false;
    });
    setPinnedCount(0);
    if (svgRef.current) {
      d3.select(svgRef.current).selectAll('.pin-indicator').attr('opacity', 0);
    }
    if (layoutMode !== 'circle') {
      simulationRef.current?.alpha(0.45).restart();
    }
  };

  const handleResetView = () => {
    setSelectedStudentId(null);
    setSelectedClusterId(null);
    setSearchStudentId('');
    setEgoDirection('both');
    setLayoutSeed((s) => s + 1);
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(180)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${survey.className}_교우관계망.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPng = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const width = svgEl.clientWidth || 900;
    const height = svgEl.clientHeight || 580;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${survey.className}_교우관계망.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleSaveMemoClick = async () => {
    if (!selectedMetric) return;
    setSavingMemo(true);
    try {
      await onSaveMemo(selectedMetric.student.id, memoDraft);
      setMemoSavedNotice(true);
    } finally {
      setSavingMemo(false);
    }
  };

  const nameOf = (id: string) => {
    const m = analytics.metricsById[id];
    return m ? `${m.student.number}번 ${m.student.name}` : id;
  };

  if (students.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-base font-semibold text-slate-900">등록된 학생 명단이 없습니다</p>
        <p className="text-sm text-slate-500">
          좌측의 &ldquo;학생 명단 · 시트&rdquo; 메뉴에서 학생을 추가하거나 구글 시트 명단을 붙여넣어 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary Toolbar: Layout Mode, Question Filter, Color Mode, Student Jump */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Layout Mode Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'force', label: '군집 배치' },
                  { id: 'target', label: '표적 동심원' },
                  { id: 'circle', label: '번호 원형' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLayoutMode(item.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    layoutMode === item.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Closeness & Tag Filter */}
            <select
              value={questionFilter}
              onChange={(e) => setQuestionFilter(e.target.value)}
              aria-label="친밀도 단계 및 태그 필터"
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:border-blue-600"
            >
              <option value="all">전체 관계 (+2 ~ -2)</option>
              <optgroup label="친밀도 단계 필터">
                <option value="score2">매우 친함 (+2)만 보기</option>
                <option value="score1">친한 편 (+1)만 보기</option>
                <option value="score1plus">긍정 전체 (+1, +2)</option>
                <option value="scoreNeg1">어색함 (-1)만 보기</option>
                <option value="scoreNeg2">불편함 (-2)만 보기</option>
                <option value="negative">어색·불편 전체 (-1, -2)</option>
              </optgroup>
              <optgroup label="긍정 태그 필터">
                {POSITIVE_RELATION_TAGS.map((tag) => (
                  <option key={tag} value={`tag:${tag}`}>
                    #{tag}
                  </option>
                ))}
              </optgroup>
              <optgroup label="갈등·어색 태그 필터">
                {NEGATIVE_RELATION_TAGS.map((tag) => (
                  <option key={tag} value={`tag:${tag}`}>
                    #{tag}
                  </option>
                ))}
              </optgroup>
            </select>

            {/* Color By Mode */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'gender', label: '성별' },
                  { id: 'closeness', label: '친밀도' },
                  { id: 'type', label: '관계유형' },
                  { id: 'cluster', label: '또래그룹' },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColorBy(c.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    colorBy === c.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Quick Student Focus Selector */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={searchStudentId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSearchStudentId(id);
                  setSelectedClusterId(null);
                  setSelectedStudentId(id || null);
                  if (id) focusNodeInView(id);
                }}
                aria-label="학생 빠른 찾기"
                className="pl-7 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-blue-600"
              >
                <option value="">학생 바로 찾기…</option>
                {[...students]
                  .sort((a, b) => a.number - b.number)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.number}번 {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Export & Zoom Controls */}
          <div className="flex items-center gap-1.5">
            {pinnedCount > 0 && layoutMode !== 'circle' && (
              <button
                type="button"
                onClick={handleUnpinAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
              >
                <PinOff className="w-3.5 h-3.5" />
                고정 해제 ({pinnedCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => handleZoom(1.22)}
              title="확대"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(0.82)}
              title="축소"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              title="배치 및 화면 초기화"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              PNG
            </button>
            <button
              type="button"
              onClick={handleExportSvg}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              SVG
            </button>
          </div>
        </div>

        {/* Secondary Edge Filter Strip */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMutualOnly((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                mutualOnly
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              상호 선택만 보기
            </button>

            <button
              type="button"
              onClick={() => setShowConflict((v) => !v)}
              disabled={mutualOnly}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                showConflict && !mutualOnly
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {showConflict && !mutualOnly ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              갈등 지명 표시
            </button>

            <button
              type="button"
              onClick={() => setHighlightAttention((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                highlightAttention
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              고립·갈등 학생 강조
            </button>

            {selectedStudentId && (
              <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-200">
                <span className="text-xs text-slate-500 mr-1">선택 화살표:</span>
                {(
                  [
                    { id: 'both', label: '전체' },
                    { id: 'incoming', label: '받은 선택' },
                    { id: 'outgoing', label: '한 선택' },
                  ] as const
                ).map((dir) => (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => setEgoDirection(dir.id)}
                    className={`px-2 py-0.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      egoDirection === dir.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-xs text-slate-500 tabular-nums">
            연결선 {visibleEdges.length}개 · 상호 친구 {analytics.mutualPairCount}쌍 · 또래 그룹{' '}
            {clusters.length}개
          </span>
        </div>
      </div>

      {/* Main Graph Canvas + Right Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div ref={containerRef} className="relative flex-1 min-h-[540px] bg-slate-50/40">
            <svg
              ref={svgRef}
              className="w-full h-[560px] block select-none"
              role="img"
              aria-label="학급 교우관계망 소시오그램"
            />

            {/* Interactive Hover Tooltip */}
            {tooltip && (
              <div
                style={{ left: tooltip.x, top: tooltip.y }}
                className="pointer-events-none absolute z-20 w-56 bg-slate-900/95 text-white rounded-lg px-3 py-2 shadow-lg space-y-0.5"
              >
                <p className="text-xs font-semibold">{tooltip.title}</p>
                <p className="text-[11px] text-slate-300">{tooltip.subtitle}</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{tooltip.detail}</p>
              </div>
            )}

            {responses.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white/95 border border-slate-200 rounded-lg px-5 py-3 text-center">
                  <p className="text-sm font-medium text-slate-800">
                    아직 제출된 학생 응답이 없습니다
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    학생이 응답을 제출하면 관계선이 실시간으로 연결됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Legend Strip */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3.5">
              {colorBy === 'gender' ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />남
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-600 inline-block" />여
                  </span>
                </>
              ) : colorBy === 'closeness' ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                    높음(+0.45↑)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                    긍정
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                    보통
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
                    어색
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                    주의(-0.45↓)
                  </span>
                </>
              ) : colorBy === 'type' ? (
                (Object.keys(TYPE_COLOR) as SociometricType[]).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: TYPE_COLOR[t] }}
                    />
                    {t}
                  </span>
                ))
              ) : (
                clusters.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.label}
                  </span>
                ))
              )}
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3.5 h-1 bg-emerald-600 inline-block rounded-xs" />
                단짝(+2↔+2)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3.5 h-0.5 bg-sky-500 inline-block" />
                상호우호
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3.5 h-0.5 bg-blue-600 inline-block" />
                일방+2
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3.5 border-t-2 border-dashed border-amber-600 inline-block" />
                어색-1
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3.5 border-t-2 border-dashed border-red-600 inline-block" />
                불편-2
              </span>
            </div>
            <span className="text-slate-500">드래그로 위치 고정 · 더블클릭으로 고정 해제</span>
          </div>
        </div>

        {/* Right Side Inspector: Selected Student OR Class Clusters & Attention Students */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          {selectedMetric ? (
            <div className="space-y-5 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {selectedMetric.student.studentCode} · {selectedMetric.student.number}번 ·{' '}
                    {selectedMetric.student.gender}
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {selectedMetric.student.name}
                  </h3>
                </div>
                <div className="text-right space-y-1">
                  <p
                    className="text-xs font-semibold"
                    style={{ color: TYPE_COLOR[selectedMetric.sociometricType] }}
                  >
                    {selectedMetric.sociometricType}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(null);
                      setSearchStudentId('');
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-700 underline cursor-pointer"
                  >
                    전체 보기로 돌아가기
                  </button>
                </div>
              </div>

              {/* Numeric summary strip */}
              <div className="grid grid-cols-4 gap-2 text-center py-2 border-b border-slate-100 tabular-nums">
                <div>
                  <p className="text-xs text-slate-500">받은친밀</p>
                  <p className="text-base font-bold text-slate-900">
                    {selectedMetric.avgClosenessReceived !== null
                      ? `${selectedMetric.avgClosenessReceived > 0 ? '+' : ''}${selectedMetric.avgClosenessReceived.toFixed(2)}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">준친밀</p>
                  <p className="text-base font-bold text-slate-700">
                    {selectedMetric.avgClosenessGiven !== null
                      ? `${selectedMetric.avgClosenessGiven > 0 ? '+' : ''}${selectedMetric.avgClosenessGiven.toFixed(2)}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">상호단짝</p>
                  <p className="text-base font-bold text-emerald-700">
                    {selectedMetric.bestFriendPairIds.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">불편·어색</p>
                  <p className="text-base font-bold text-red-600">{selectedMetric.negativeIn}</p>
                </div>
              </div>

              {/* Mini 5-Level Received Closeness Distribution Bar */}
              {(() => {
                const rc = selectedMetric.receivedScoreCounts;
                const tot = rc[2] + rc[1] + rc[0] + rc[-1] + rc[-2];
                if (tot === 0) return null;
                const segs = [
                  { score: 2, count: rc[2], color: '#059669', label: '+2' },
                  { score: 1, count: rc[1], color: '#2563EB', label: '+1' },
                  { score: 0, count: rc[0], color: '#CBD5E1', label: '0' },
                  { score: -1, count: rc[-1], color: '#D97706', label: '-1' },
                  { score: -2, count: rc[-2], color: '#DC2626', label: '-2' },
                ];
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                      <span className="font-semibold text-slate-700">받은 친밀도 분포</span>
                      <span>
                        +2:{rc[2]} · +1:{rc[1]} · 0:{rc[0]} · -1:{rc[-1]} · -2:{rc[-2]}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded overflow-hidden flex bg-slate-100">
                      {segs.map((seg) =>
                        seg.count > 0 ? (
                          <div
                            key={seg.score}
                            style={{
                              width: `${(seg.count / tot) * 100}%`,
                              backgroundColor: seg.color,
                            }}
                            title={`${seg.label}: ${seg.count}명`}
                          />
                        ) : null
                      )}
                    </div>
                  </div>
                );
              })()}

              {onViewStudentResponse && (
                <button
                  type="button"
                  onClick={() => onViewStudentResponse(selectedMetric.student.id)}
                  className="w-full py-2 px-3 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  {selectedMetric.student.name} 학생의 1:1 전체 응답표 보기
                </button>
              )}

              {(selectedMetric.topPositiveTags.length > 0 ||
                selectedMetric.topNegativeTags.length > 0) && (
                <div className="text-xs space-y-1">
                  {selectedMetric.topPositiveTags.length > 0 && (
                    <p className="text-slate-600">
                      <span className="font-semibold text-blue-700 mr-1.5">긍정 태그</span>
                      {selectedMetric.topPositiveTags
                        .map((t) => `#${t.tag}(${t.count})`)
                        .join('  ')}
                    </p>
                  )}
                  {selectedMetric.topNegativeTags.length > 0 && (
                    <p className="text-slate-600">
                      <span className="font-semibold text-red-600 mr-1.5">갈등 태그</span>
                      {selectedMetric.topNegativeTags
                        .map((t) => `#${t.tag}(${t.count})`)
                        .join('  ')}
                    </p>
                  )}
                </div>
              )}

              {/* Relationship lists */}
              <div className="space-y-3.5 text-sm flex-1 overflow-y-auto">
                <div>
                  <p className="text-xs font-semibold text-emerald-700 mb-1">
                    상호 선택 친구 ({selectedMetric.mutualIds.length}명)
                  </p>
                  <p className="text-slate-700 leading-relaxed">
                    {selectedMetric.mutualIds.length > 0
                      ? selectedMetric.mutualIds.map(nameOf).join(', ')
                      : '없음'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    이 학생을 선택한 친구 ({selectedMetric.chosenByPositive.length}명)
                  </p>
                  <p className="text-slate-700 leading-relaxed">
                    {selectedMetric.chosenByPositive.length > 0
                      ? selectedMetric.chosenByPositive.map(nameOf).join(', ')
                      : '없음'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    이 학생이 선택한 친구 ({selectedMetric.chosePositive.length}명)
                  </p>
                  <p className="text-slate-700 leading-relaxed">
                    {selectedMetric.chosePositive.length > 0
                      ? selectedMetric.chosePositive.map(nameOf).join(', ')
                      : selectedMetric.responded
                      ? '없음'
                      : '미응답'}
                  </p>
                </div>

                {(selectedMetric.chosenByNegative.length > 0 ||
                  selectedMetric.choseNegative.length > 0) && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    {selectedMetric.chosenByNegative.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-0.5">
                          갈등·불편으로 지명한 친구 ({selectedMetric.chosenByNegative.length}명)
                        </p>
                        <p className="text-slate-700">
                          {selectedMetric.chosenByNegative.map(nameOf).join(', ')}
                        </p>
                      </div>
                    )}
                    {selectedMetric.choseNegative.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-0.5">
                          이 학생이 불편하다고 답한 친구 ({selectedMetric.choseNegative.length}명)
                        </p>
                        <p className="text-slate-700">
                          {selectedMetric.choseNegative.map(nameOf).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedMetric.teacherNote && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold text-blue-700 mb-1">
                      학생이 선생님께 남긴 말
                    </p>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 leading-relaxed">
                      {selectedMetric.teacherNote}
                    </p>
                  </div>
                )}

                {/* Teacher Counseling Memo */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="teacher-memo-input"
                      className="text-xs font-semibold text-slate-700"
                    >
                      교사 비공개 상담 메모
                    </label>
                    {memoSavedNotice && (
                      <span className="text-xs text-emerald-700 font-medium">저장됨</span>
                    )}
                  </div>
                  <textarea
                    id="teacher-memo-input"
                    rows={3}
                    maxLength={500}
                    value={memoDraft}
                    onChange={(e) => {
                      setMemoDraft(e.target.value);
                      setMemoSavedNotice(false);
                    }}
                    placeholder="관찰 내용이나 상담 계획을 기록하세요..."
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveMemoClick}
                    disabled={savingMemo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingMemo ? '저장 중...' : '메모 저장'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between space-y-5">
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">교우관계망 해석 도우미</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    학생 노드를 클릭하면 해당 학생의 상호·일방·갈등 관계와 상담 메모를 확인할 수
                    있습니다.
                  </p>
                </div>

                {/* Detected Peer Subgroups / Cliques */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">
                      감지된 상호 또래 그룹 ({clusters.length}개)
                    </p>
                    {selectedClusterId && (
                      <button
                        type="button"
                        onClick={() => setSelectedClusterId(null)}
                        className="text-[11px] text-blue-700 hover:underline cursor-pointer"
                      >
                        강조 해제
                      </button>
                    )}
                  </div>
                  {clusters.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      상호 선택으로 연결된 2명 이상의 또래 그룹이 아직 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {clusters.map((cluster) => {
                        const isSelected = selectedClusterId === cluster.id;
                        return (
                          <button
                            key={cluster.id}
                            type="button"
                            onClick={() =>
                              setSelectedClusterId((prev) =>
                                prev === cluster.id ? null : cluster.id
                              )
                            }
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full inline-block"
                                  style={{ backgroundColor: cluster.color }}
                                />
                                {cluster.label}
                              </span>
                              <span className="tabular-nums opacity-75">
                                {cluster.memberIds.length}명
                              </span>
                            </div>
                            <p
                              className={`text-xs mt-1 truncate ${
                                isSelected ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {cluster.memberIds
                                .map((id) => analytics.metricsById[id]?.student.name || id)
                                .join(', ')}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Attention Needed Students */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">
                    관심 관찰이 필요한 학생 ({analytics.attentionStudents.length}명)
                  </p>
                  {analytics.attentionStudents.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      현재 기준에서 주의 대상 학생이 발견되지 않았습니다.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {analytics.attentionStudents.slice(0, 6).map((m) => (
                        <li key={m.student.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClusterId(null);
                              setSelectedStudentId(m.student.id);
                              setSearchStudentId(m.student.id);
                              focusNodeInView(m.student.id);
                            }}
                            className="w-full py-2 flex items-center justify-between text-left hover:bg-slate-50 rounded px-1.5 transition-colors cursor-pointer"
                          >
                            <div>
                              <span className="text-sm font-medium text-slate-900">
                                {m.student.number}번 {m.student.name}
                              </span>
                              <span className="text-xs text-slate-500 ml-2 tabular-nums">
                                긍정 {m.positiveIn} · 갈등 {m.negativeIn}
                              </span>
                            </div>
                            <span
                              className="text-xs font-semibold"
                              style={{ color: TYPE_COLOR[m.sociometricType] }}
                            >
                              {m.sociometricType}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 tabular-nums flex items-center justify-between">
                <span>응답 {analytics.respondedCount}/{analytics.totalStudents}명</span>
                <span>학급 응집도 {analytics.reciprocityRate}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
