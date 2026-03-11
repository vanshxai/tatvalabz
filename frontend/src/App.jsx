/**
 * App.jsx — Glassmorphic Industrial Workspace
 * Main canvas & orchestrator with frosted glass panels,
 * industrial glow accents, and refined visual hierarchy.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import Sidebar from "./Sidebar";
import NavBar from "./NavBar";
import CustomNode from "./CustomNode";
import DeletableEdge from "./DeletableEdge";
import { getUnconnectedInputs, compileGraphToBackendJSON, compileSkeletonToFormulas, validatePayload } from "./GraphCompiler";
import TemplateRegistry from "./TemplateRegistry";
import LandingPage from "./LandingPage";
import NodeInspectorPanel from "./NodeInspectorPanel";
import ResultsDashboard from "./ResultsDashboard";
import ExecutionTrace from "./ExecutionTrace";
import SkeletonEditor from "./SkeletonEditor";
import ComponentRegistry from "./ComponentRegistry";
import CustomDialog, { customAlert, customConfirm, customPrompt } from "./CustomDialog";
import ScenarioManager from "./ScenarioManager";
import { supabase } from "./supabaseClient";
import { getTemplateComponentKey } from "./templateUtils";
import { resolveNodeIcon } from "./IconCatalog";
import { warmMaterialLibraryCache } from "./materials/materialLibrary";
import { inferAutoMaterialBinding } from "./materials/materialAutoMap";

const nodeTypes = { customNode: CustomNode };
const edgeTypes = { deletable: DeletableEdge };
const WORKSPACE_DRAFT_KEY = "faulter_workspace_draft";
const WORKSPACE_ACTIVE_SESSION_KEY = "faulter_workspace_active_session";
const WORKSPACE_OPENED_THIS_TAB_KEY = "faulter_workspace_opened_this_tab";
const WORKSPACE_LAUNCH_INTENT_KEY = "faulter_workspace_launch_intent";

class LandingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    this.setState({ error });
  }
  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error);
      }
      return this.props.fallback;
    }
    return this.props.children;
  }
}
const WORKSPACE_ACTIVE_AT_KEY = "faulter_workspace_active_at";
const WORKSPACE_RESUME_INTENT_AT_KEY = "faulter_workspace_resume_intent_at";
const WORKSPACE_RESUME_TTL_MS = 30 * 60 * 1000;
const WORKSPACE_RESUME_INTENT_TTL_MS = 20 * 1000;
const WORKSPACE_DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.9 };
const WORKSPACE_MIN_ZOOM = 0.72;
const WORKSPACE_MAX_ZOOM = 1.5;

// Global IDs are calculated dynamically inside onDrop

const BACKEND_URL = "";

/* ══════════════════════════════════════════════
   Glassmorphic style helpers
   ══════════════════════════════════════════════ */
const glassStyle = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border-technical)',
};

const glassHeaderStyle = {
  background: 'var(--bg-card)',
  borderBottom: '1px solid var(--border-technical)',
};

const glassButtonBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 14px',
  borderRadius: '2px',
  fontSize: '11px',
  fontWeight: 700,
  transition: 'all 0.15s ease',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-technical)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const topActionBtnBase = {
  height: '24px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  cursor: 'pointer',
  transition: 'all 0.1s ease',
  fontSize: '9px',
  fontWeight: 900,
  padding: '0 10px',
  letterSpacing: '0.08em',
  fontFamily: "var(--font-body)",
};
const popupMenuRadius = "10px";
const sidePanelRadius = "12px";

const makeNodeInputKey = (nodeId, inputName) => `${nodeId}::${inputName}`;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCanvasEdges = (edgeList = []) =>
  edgeList.map((edge) => ({ ...edge, type: "deletable" }));

const getSweepRunCountFromResult = (result) => {
  if (!result) return 0;
  if (Array.isArray(result.scenario_results) && result.scenario_results.length > 0) {
    return result.scenario_results.reduce((sum, sc) => {
      const sweepPoints = sc?.sweep_points ?? sc?.data_points?.length ?? 1;
      return sum + Math.max(1, Number(sweepPoints) || 1);
    }, 0);
  }
  if (typeof result.sweep_points === "number") return Math.max(1, result.sweep_points);
  if (result.node_outputs || result.system_state) return 1;
  return 0;
};


const resolveNodeInputAutofillValue = (node, inputName) => {
  if (!node || !inputName) return null;
  const sensorValue = Number(node?.data?.sensorParams?.[inputName]);
  if (Number.isFinite(sensorValue)) return sensorValue;
  const nodeType = node?.data?.type;
  const registry = nodeType ? ComponentRegistry[nodeType] : null;
  const defaultValue = Number(registry?.defaultParams?.[inputName]);
  if (Number.isFinite(defaultValue)) return defaultValue;
  return null;
};

function TemplateSummary({ template }) {
  if (!template) return null;
  return (
    <div className="rounded-sm border border-white/10 bg-[rgba(5,11,19,0.8)] p-4">
      <div className="flex flex-wrap gap-2 mb-2">
        {template.nodes.map((node) => (
          <span
            key={node.id}
            className="px-2 py-1 text-[11px] rounded-sm border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-white/80"
          >
            {node.data?.label || node.type.replace(/_/g, " ").toUpperCase()}
          </span>
        ))}
      </div>
      <div className="text-[11px] text-[#94a3b8]">
        {template.nodes.length} components • {template.edges.length} links • complexity Lvl {template.complexity}
      </div>
    </div>
  );
}

function Flow({ isStarted, onExit }) {
  const reactFlowWrapper = useRef(null);
  const quickProfileRef = useRef(null);
  const exportMenuRef = useRef(null);
  const simulateBtnRef = useRef(null);
  const libraryBtnRef = useRef(null);
  const simulatePanelRef = useRef(null);
  const libraryPanelRef = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rfInstance, setRfInstance] = useState(null);
  const [compiledJson, setCompiledJson] = useState(null);
  const [backendResult, setBackendResult] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showLibraryPanel, setShowLibraryPanel] = useState(false);
  const [activeTab, setActiveTab] = useState("simulation");
  const [resultsTab, setResultsTab] = useState("inputs");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leafInputs, setLeafInputs] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [connectionToast, setConnectionToast] = useState(null);

  // ── Simulation Orchestrator State ──
  const [scenarios, setScenarios] = useState([]);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [activeSection, setActiveSection] = useState("workspace");
  const [activeSkeletonNodeId, setActiveSkeletonNodeId] = useState(null);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [inspectedNodeId, setInspectedNodeId] = useState(null);
  const sortedTemplates = useMemo(() => {
    return [...TemplateRegistry].sort((a, b) => (a.complexity || 0) - (b.complexity || 0));
  }, []);
  const [selectedTemplateId, setSelectedTemplateId] = useState(sortedTemplates[0]?.id || null);
  const [projectSearch, setProjectSearch] = useState('');
  const [showQuickProfileMenu, setShowQuickProfileMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isCsvExporting, setIsCsvExporting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [externalDevices, setExternalDevices] = useState(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState(null);
  const [devicesTab, setDevicesTab] = useState("serial");
  const [agentUrl, setAgentUrl] = useState(() => {
    try {
      return localStorage.getItem("tatvalabz_agent_url") || "http://127.0.0.1:8787";
    } catch {
      return "http://127.0.0.1:8787";
    }
  });
  const [executionRecords, setExecutionRecords] = useState([]);
  const [activeCalculationPreview, setActiveCalculationPreview] = useState(null);
  const [selectedCalculationByProject, setSelectedCalculationByProject] = useState({});
  const [didRestoreDraft, setDidRestoreDraft] = useState(false);

  // ── Pyodide WebWorker State ──
  const pyodideWorkerRef = useRef(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideStatus, setPyodideStatus] = useState('Initializing...');
  const solveResolverRef = useRef(null);
  const exportMenuCloseTimeoutRef = useRef(null);
  const quickProfileMenuCloseTimeoutRef = useRef(null);

  // Persistent Sequence Counter for dropping nodes
  const nodeSequenceCount = useRef(0);

  // ── Open Inspector via EDIT button on nodes ──
  useEffect(() => {
    const handleOpenInspector = (e) => {
      const { nodeId } = e.detail;
      if (nodeId) setInspectedNodeId(nodeId);
    };
    window.addEventListener('openNodeInspector', handleOpenInspector);
    return () => window.removeEventListener('openNodeInspector', handleOpenInspector);
  }, []);

  // ── Close quick profile/export menus on outside click ──
  useEffect(() => {
    const handleOutside = (e) => {
      if (showQuickProfileMenu && quickProfileRef.current && !quickProfileRef.current.contains(e.target)) {
        setShowQuickProfileMenu(false);
      }
      if (showExportMenu && exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showQuickProfileMenu, showExportMenu]);

  useEffect(() => {
    return () => {
      if (exportMenuCloseTimeoutRef.current) {
        clearTimeout(exportMenuCloseTimeoutRef.current);
        exportMenuCloseTimeoutRef.current = null;
      }
      if (quickProfileMenuCloseTimeoutRef.current) {
        clearTimeout(quickProfileMenuCloseTimeoutRef.current);
        quickProfileMenuCloseTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    warmMaterialLibraryCache();
  }, []);

  const cancelExportMenuClose = useCallback(() => {
    if (exportMenuCloseTimeoutRef.current) {
      clearTimeout(exportMenuCloseTimeoutRef.current);
      exportMenuCloseTimeoutRef.current = null;
    }
  }, []);

  const scheduleExportMenuClose = useCallback(() => {
    cancelExportMenuClose();
    exportMenuCloseTimeoutRef.current = setTimeout(() => {
      setShowExportMenu(false);
      exportMenuCloseTimeoutRef.current = null;
    }, 220);
  }, [cancelExportMenuClose]);

  const cancelQuickProfileMenuClose = useCallback(() => {
    if (quickProfileMenuCloseTimeoutRef.current) {
      clearTimeout(quickProfileMenuCloseTimeoutRef.current);
      quickProfileMenuCloseTimeoutRef.current = null;
    }
  }, []);

  const scheduleQuickProfileMenuClose = useCallback(() => {
    cancelQuickProfileMenuClose();
    quickProfileMenuCloseTimeoutRef.current = setTimeout(() => {
      setShowQuickProfileMenu(false);
      quickProfileMenuCloseTimeoutRef.current = null;
    }, 220);
  }, [cancelQuickProfileMenuClose]);

  useEffect(() => {
    // Force landing page until user explicitly launches workspace.
    try {
      sessionStorage.removeItem(WORKSPACE_ACTIVE_SESSION_KEY);
      sessionStorage.removeItem(WORKSPACE_ACTIVE_AT_KEY);
      sessionStorage.removeItem(WORKSPACE_RESUME_INTENT_AT_KEY);
      sessionStorage.removeItem(WORKSPACE_OPENED_THIS_TAB_KEY);
      sessionStorage.removeItem(WORKSPACE_LAUNCH_INTENT_KEY);
    } catch {
      // Ignore sessionStorage write failures.
    }
  }, []);

  useEffect(() => {
    const handleOutsidePanels = (e) => {
      if (showPanel) {
        const insidePanel = simulatePanelRef.current && simulatePanelRef.current.contains(e.target);
        const insideButton = simulateBtnRef.current && simulateBtnRef.current.contains(e.target);
        if (!insidePanel && !insideButton) setShowPanel(false);
      }
      if (showLibraryPanel) {
        const insidePanel = libraryPanelRef.current && libraryPanelRef.current.contains(e.target);
        const insideButton = libraryBtnRef.current && libraryBtnRef.current.contains(e.target);
        if (!insidePanel && !insideButton) setShowLibraryPanel(false);
      }
    };
    document.addEventListener("mousedown", handleOutsidePanels);
    document.addEventListener("touchstart", handleOutsidePanels);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePanels);
      document.removeEventListener("touchstart", handleOutsidePanels);
    };
  }, [showPanel, showLibraryPanel]);

  useEffect(() => {
    if (!isStarted) return;
    const touchActiveAt = () => {
      try {
        sessionStorage.setItem(WORKSPACE_ACTIVE_AT_KEY, String(Date.now()));
      } catch {
        // Ignore sessionStorage write failures.
      }
    };
    const markResumeIntent = () => {
      try {
        sessionStorage.setItem(WORKSPACE_RESUME_INTENT_AT_KEY, String(Date.now()));
      } catch {
        // Ignore sessionStorage write failures.
      }
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, touchActiveAt, { passive: true }));
    window.addEventListener("beforeunload", markResumeIntent);
    const heartbeat = setInterval(touchActiveAt, 60 * 1000);
    touchActiveAt();
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, touchActiveAt));
      window.removeEventListener("beforeunload", markResumeIntent);
      clearInterval(heartbeat);
    };
  }, [isStarted]);

  // Auth + licensing flows removed.

  // ── Initialize Pyodide WebWorker ──
  useEffect(() => {
    const worker = new Worker(
      new URL('./pyodideWorker.js', import.meta.url),
      { type: 'classic' }
    );

    worker.onmessage = (event) => {
      const { type, result, error, message } = event.data;
      if (type === 'STATUS') {
        setPyodideStatus(message);
        if (message.includes('Ready')) setPyodideReady(true);
      } else if (type === 'RESULT') {
        if (solveResolverRef.current) {
          solveResolverRef.current.resolve(result);
          solveResolverRef.current = null;
        }
      } else if (type === 'ERROR') {
        if (solveResolverRef.current) {
          solveResolverRef.current.reject(new Error(error));
          solveResolverRef.current = null;
        }
      }
    };

    pyodideWorkerRef.current = worker;
    pyodideWorkerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // ── Active project tracking ──
  // When a saved project is loaded, we track its id/name so auto-sync updates it in-place
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle"); // 'idle' | 'syncing' | 'saved'

  // ── Unsaved-changes tracking ──
  // Snapshot stores only structural keys (node ids + edge connections)
  // NOT positions — React Flow adjusts positions on load (fitView), causing false positives
  const lastSavedSnapshot = useRef({ nodeIds: '', edgeKeys: '' });
  const autoSaveTimeoutRef = useRef(null);
  const AUTO_SAVE_IDLE_MS = 4000;

  const makeSnapshotKeys = useCallback((nodeList, edgeList) => {
    const nodeIds = nodeList.map(n => n.id).sort().join(',');
    const edgeKeys = edgeList.map(e => `${e.source}-${e.sourceHandle}>${e.target}-${e.targetHandle}`).sort().join(',');
    return { nodeIds, edgeKeys };
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    const snap = lastSavedSnapshot.current;
    const curr = makeSnapshotKeys(nodes, edges);
    return snap.nodeIds !== curr.nodeIds || snap.edgeKeys !== curr.edgeKeys;
  }, [nodes, edges, makeSnapshotKeys]);

  // Only track workflow-structure edits for idle autosave scheduling.
  const workflowStructureKey = useMemo(() => {
    const { nodeIds, edgeKeys } = makeSnapshotKeys(nodes, edges);
    return `${nodeIds}||${edgeKeys}`;
  }, [nodes, edges, makeSnapshotKeys]);

  const hasPotentialDataLoss = useCallback(() => {
    const hasGraph = nodes.length > 0 || edges.length > 0;
    if (!hasGraph) return false;
    if (!currentProjectId) return true;
    return hasUnsavedChanges();
  }, [nodes.length, edges.length, currentProjectId, hasUnsavedChanges]);

  // ── Saved Projects (localStorage) ──
  const STORAGE_KEY = "faulter_saved_projects";
  const [savedProjects, setSavedProjects] = useState(() => {
    try {
      let stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      // Purge old 13+ digit timestamp junk from projects
      stored = stored.map(p => ({
        ...p,
        nodes: p.nodes?.filter(n => !(n.id.length > 10 && !n.id.startsWith('Node '))) || [],
        edges: p.edges?.filter(e => !(e.source.length > 10 && !e.source.startsWith('Node '))) || [],
        executionRecords: Array.isArray(p.executionRecords) ? p.executionRecords : [],
      }));
      return stored;
    }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProjects));
  }, [savedProjects]);

  // ── Restore current in-progress workspace draft after refresh ──
  useEffect(() => {
    if (didRestoreDraft) return;
    try {
      const raw = localStorage.getItem(WORKSPACE_DRAFT_KEY);
      if (!raw) {
        setDidRestoreDraft(true);
        return;
      }
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== "object") {
        setDidRestoreDraft(true);
        return;
      }

      const draftNodes = Array.isArray(draft.nodes) ? draft.nodes : [];
      const draftEdges = normalizeCanvasEdges(Array.isArray(draft.edges) ? draft.edges : []);
      const draftScenarios = Array.isArray(draft.scenarios) ? draft.scenarios : [{ id: 'scenario-1', name: 'Baseline Scenario', sweeps: {} }];
      const draftRecords = Array.isArray(draft.executionRecords) ? draft.executionRecords : [];

      setNodes(draftNodes);
      setEdges(draftEdges);
      setScenarios(draftScenarios);
      setExecutionRecords(draftRecords);
      setBackendResult(draft.backendResult || null);
      setCompiledJson(draft.compiledJson || null);
      setCurrentProjectId(draft.currentProjectId || null);
      setCurrentProjectName(draft.currentProjectName || null);
      if (typeof draft.selectedTemplateId === "string") setSelectedTemplateId(draft.selectedTemplateId);
      if (typeof draft.activeSection === "string") setActiveSection(draft.activeSection);
      if (typeof draft.activeTab === "string") {
        if (draft.activeTab === "inputs" || draft.activeTab === "compiled" || draft.activeTab === "solver") {
          setActiveTab("results");
          setResultsTab(draft.activeTab);
        } else {
          setActiveTab(draft.activeTab === "library" ? "simulation" : draft.activeTab);
        }
      }
      if (typeof draft.resultsTab === "string") setResultsTab(draft.resultsTab);
      if (typeof draft.showPanel === "boolean") setShowPanel(draft.showPanel);
      if (typeof draft.showLibraryPanel === "boolean") setShowLibraryPanel(draft.showLibraryPanel);

      const restoredUnconnected = getUnconnectedInputs(draftNodes, draftEdges);
      setLeafInputs(restoredUnconnected);
      setInputValues((prev) => {
        const next = { ...(draft.inputValues || prev) };
        restoredUnconnected.forEach(({ nodeId, inputName }) => {
          const key = makeNodeInputKey(nodeId, inputName);
          if (!(key in next)) {
            const auto = getAutofillValueForInput(nodeId, inputName, draftNodes);
            next[key] = auto ?? 0;
          }
        });
        return next;
      });
    } catch (err) {
      console.error("Failed to restore workspace draft:", err.message);
    } finally {
      setDidRestoreDraft(true);
    }
  }, [didRestoreDraft, setNodes, setEdges]);

  // ── Persist current in-progress workspace draft so refresh is lossless ──
  useEffect(() => {
    if (!didRestoreDraft) return;
    try {
      const draft = {
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        scenarios: structuredClone(scenarios),
        executionRecords: structuredClone(executionRecords),
        backendResult: backendResult ? structuredClone(backendResult) : null,
        compiledJson: compiledJson ? structuredClone(compiledJson) : null,
        inputValues: structuredClone(inputValues),
        currentProjectId,
        currentProjectName,
        activeSection,
        selectedTemplateId,
        activeTab,
        resultsTab,
        showPanel,
        showLibraryPanel,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(WORKSPACE_DRAFT_KEY, JSON.stringify(draft));
    } catch (err) {
      console.error("Failed to persist workspace draft:", err.message);
    }
  }, [
    didRestoreDraft,
    nodes,
    edges,
    scenarios,
    executionRecords,
    backendResult,
    compiledJson,
    inputValues,
    currentProjectId,
    currentProjectName,
    activeSection,
    selectedTemplateId,
    activeTab,
    resultsTab,
    showPanel,
    showLibraryPanel,
  ]);

  // ── Initial Cloud Load ──
  useEffect(() => {
    const fetchCloudProjects = async () => {
      try {
        const { data, error } = await supabase.from('workspaces').select('*');
        if (error) throw error;

        if (data && data.length > 0) {
          const cloudProjects = data.map(row => ({
            ...row.payload, // the original project object is in payload
            executionRecords: Array.isArray(row.payload?.executionRecords) ? row.payload.executionRecords : [],
            savedAt: row.updated_at
          }));

          setSavedProjects(prev => {
            const merged = [...prev];
            cloudProjects.forEach(cp => {
              const existingIdx = merged.findIndex(p => p.id === cp.id);
              if (existingIdx >= 0) {
                // Overwrite with cloud version to stay in sync
                merged[existingIdx] = cp;
              } else {
                merged.push(cp);
              }
            });
            // Sort by newest first
            return merged.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
          });
          console.log("Cloud sync complete: Loaded workspaces.");
        }
      } catch (err) {
        console.error("Failed to load from cloud:", err.message);
      }
    };

    // Only fetch once on mount
    fetchCloudProjects();
  }, []);


  // ── Custom Components (localStorage & Cloud Sync) ──
  const CUSTOM_COMPONENTS_KEY = "faulter_custom_components";
  const [customComponents, setCustomComponents] = useState(() => {
    try {
      let stored = JSON.parse(localStorage.getItem(CUSTOM_COMPONENTS_KEY)) || [];
      // Purge old long-hash custom components permanently
      stored = stored.filter(comp => !comp.registryKey.match(/_\d{13,}$/));

      stored.forEach((comp) => {
        if (!ComponentRegistry[comp.registryKey]) {
          ComponentRegistry[comp.registryKey] = {
            label: comp.label, inputs: comp.inputs, outputs: comp.outputs,
            formulas: comp.formulas, defaultParams: comp.defaultParams || {},
            icon: comp.icon || "◉",
          };
        }
      });
      return stored;
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(customComponents));
  }, [customComponents]);

  // Initial Cloud Load for Components
  useEffect(() => {
    const fetchCloudComponents = async () => {
      try {
        const { data, error } = await supabase.from('custom_components').select('*');
        if (error) {
          // If table doesn't exist yet, it fails gracefully
          console.log("Supabase custom_components table not found or empty.");
          return;
        }

        if (data && data.length > 0) {
          const cloudComps = data.map(row => row.payload);

          setCustomComponents(prev => {
            const merged = [...prev];
            cloudComps.forEach(cc => {
              const existingIdx = merged.findIndex(c => c.registryKey === cc.registryKey);
              if (existingIdx >= 0) {
                merged[existingIdx] = cc; // overwrite local with cloud
              } else {
                merged.push(cc);
              }
              // Inject into React Flow Registry
              if (!ComponentRegistry[cc.registryKey]) {
                ComponentRegistry[cc.registryKey] = {
                  label: cc.label, inputs: cc.inputs, outputs: cc.outputs,
                  formulas: cc.formulas, defaultParams: cc.defaultParams || {},
                  icon: cc.icon || "◉",
                };
              }
            });
            return merged;
          });
          console.log(`Cloud sync complete: Loaded ${cloudComps.length} custom components.`);
        }
      } catch (err) {
        console.error("Failed to load components from cloud:", err.message);
      }
    };

    fetchCloudComponents();
  }, []);

  useEffect(() => {
    const handler = async (e) => {
      const { label, inputs, outputs, formulas, defaultParams, icon } = e.detail;

      let slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, '');
      if (!slug) slug = "node";
      let registryKey = `custom_${slug}`;
      let finalLabel = label;

      let counter = 2;
      while (ComponentRegistry[registryKey]) {
        registryKey = `custom_${slug}_${counter}`;
        finalLabel = `${label} (${counter})`;
        counter++;
      }

      ComponentRegistry[registryKey] = {
        label: finalLabel,
        inputs,
        outputs,
        formulas,
        defaultParams: defaultParams || {},
        icon: icon || "◉",
      };
      const newComp = {
        id: Date.now().toString(), registryKey, label: finalLabel, inputs, outputs, formulas,
        defaultParams: defaultParams || {}, icon: icon || "◉", savedAt: new Date().toISOString(),
      };

      setCustomComponents((prev) => [...prev, newComp]);
      showToast(`NODE_SYNC // "${label}" saved to Node Library`, "success");

      // Push to Cloud
      try {
        await supabase.from('custom_components').upsert({
          id: newComp.id,
          registry_key: newComp.registryKey,
          label: newComp.label,
          payload: newComp,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } catch (err) {
        console.error("Failed to push component to cloud:", err.message);
      }
    };
    window.addEventListener("saveCustomComponent", handler);

    const skeletonHandler = (e) => {
      setActiveSkeletonNodeId(e.detail.nodeId);
      setActiveSection("skeleton_editor");
      setInspectedNodeId(null);
    };
    window.addEventListener("openSkeletonEditor", skeletonHandler);

    const toastHandler = (e) => showToast(e.detail.message, e.detail.type);
    window.addEventListener("showToast", toastHandler);

    return () => {
      window.removeEventListener("saveCustomComponent", handler);
      window.removeEventListener("openSkeletonEditor", skeletonHandler);
      window.removeEventListener("showToast", toastHandler);
    };
  }, []);

  // ── Cloud Sync Logic ──
  // ── Cloud Sync Logic ──
  const syncToCloud = useCallback(async (project) => {
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .upsert({
          id: project.id,
          name: project.name,
          payload: project, // Full snapshot including scenarios & results
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) throw error;
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus("idle"), 2000);
      console.log(`Cloud Sync Success // ${project.name}`);
    } catch (err) {
      console.error(`Cloud Sync Failed // ${err.message}`);
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 2000);
      // Fail silently in UI to preserve "Local First" experience
    }
  }, []);

  const buildProjectSnapshot = useCallback((projectId, projectName) => ({
    id: projectId,
    name: projectName,
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    scenarios: structuredClone(scenarios),
    executionRecords: structuredClone(executionRecords),
    backendResult: backendResult ? structuredClone(backendResult) : null,
    savedAt: new Date().toISOString(),
  }), [nodes, edges, scenarios, executionRecords, backendResult]);

  const persistProjectSnapshot = useCallback((project, { syncCloud = true } = {}) => {
    setSavedProjects((prev) => {
      const exists = prev.some((p) => p.id === project.id);
      if (!exists) return [project, ...prev];
      return prev.map((p) => (p.id === project.id ? project : p));
    });
    lastSavedSnapshot.current = makeSnapshotKeys(project.nodes, project.edges);
    if (syncCloud) syncToCloud(project);
  }, [makeSnapshotKeys, syncToCloud]);

  // ── Idle Auto-Save (save only after user stops editing for a few seconds) ──
  useEffect(() => {
    if (!currentProjectId || !isStarted || !hasUnsavedChanges()) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      setSyncStatus("syncing");
      const updatedProject = buildProjectSnapshot(currentProjectId, currentProjectName);
      persistProjectSnapshot(updatedProject);
      autoSaveTimeoutRef.current = null;
    }, AUTO_SAVE_IDLE_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [
    currentProjectId,
    currentProjectName,
    isStarted,
    workflowStructureKey,
    hasUnsavedChanges,
    buildProjectSnapshot,
    persistProjectSnapshot,
    AUTO_SAVE_IDLE_MS,
  ]);


  const handleSaveProject = async () => {
    // If project already exists, force an immediate save (flush pending auto-save)
    if (currentProjectId) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      setSyncStatus("syncing");
      const updatedProject = buildProjectSnapshot(currentProjectId, currentProjectName);
      persistProjectSnapshot(updatedProject);
      showToast(`✅ Saved "${updatedProject.name}"`, "success");
      return true;
    }

    // Brand-new workflow → prompt for a name
    const name = await customPrompt('Save Project', 'Enter a name for this project:');
    if (!name || !name.trim()) return false;
    const project = buildProjectSnapshot(Date.now().toString(), name.trim());
    // Now track this as the active project
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    persistProjectSnapshot(project);

    showToast(`✅ Project "${project.name}" created!`, "success");
    return true;
  };

  const confirmProceedWithPotentialDataLoss = useCallback(async () => {
    if (!hasPotentialDataLoss()) return true;
    if (currentProjectId) {
      const saved = await handleSaveProject();
      if (!saved) return false;
      showToast("Autosaved before switching.", "success");
    }
    // For unnamed drafts, continue without modal and keep draft persistence in localStorage.
    return true;
  }, [hasPotentialDataLoss, currentProjectId, handleSaveProject]);

  const handleLoadProject = async (project) => {
    const canProceed = await confirmProceedWithPotentialDataLoss();
    if (!canProceed) return;

    const loadedNodes = structuredClone(project.nodes || []);
    const loadedEdges = normalizeCanvasEdges(structuredClone(project.edges || []));

    // Use structuredClone to deep copy nodes/edges/scenarios to ensure React updates
    setNodes(loadedNodes);
    setEdges(loadedEdges);

    // Rebuild execution context from loaded graph so Inputs/Trace tabs are immediately accurate.
    const loadedActiveScenarios = (project.scenarios || []).filter((s) => s.isActive);
    setCompiledJson(compileGraphToBackendJSON(loadedNodes, loadedEdges, {}, loadedActiveScenarios));
    const loadedUnconnected = getUnconnectedInputs(loadedNodes, loadedEdges);
    setLeafInputs(loadedUnconnected);
    setInputValues((prev) => {
      const next = { ...prev };
      loadedUnconnected.forEach(({ nodeId, inputName }) => {
        const key = makeNodeInputKey(nodeId, inputName);
        if (!(key in next)) {
          const auto = getAutofillValueForInput(nodeId, inputName, loadedNodes);
          next[key] = auto ?? 0;
        }
      });
      return next;
    });

    // Restore scenarios if present, otherwise default
    if (project.scenarios && project.scenarios.length > 0) {
      setScenarios(structuredClone(project.scenarios));
    } else {
      setScenarios([{ id: 'scenario-1', name: 'Baseline Scenario', sweeps: {} }]);
    }
    setExecutionRecords(structuredClone(project.executionRecords || []));

    // Restore results and panel state
    if (project.backendResult) {
      setBackendResult(structuredClone(project.backendResult));
      setShowPanel(true);
      setShowLibraryPanel(false);
      setActiveTab("results");
      setResultsTab("solver");
    } else {
      setBackendResult(null);
      setShowPanel(false);
    }

    setError(null); setActiveSection("workspace");
    // Track which project we're on
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    // Snapshot from the saved data (not from React state, which may not have updated yet)
    lastSavedSnapshot.current = makeSnapshotKeys(project.nodes || [], project.edges || []);
    showToast(`📂 Loaded "${project.name}"`, "success");
  };

  // ── New Workflow handler ──

  const handleNewWorkflow = async () => {
    if (nodes.length === 0 && edges.length === 0) {
      showToast('LOG // Canvas is already empty', 'info');
      return;
    }

    if (hasUnsavedChanges() && currentProjectId) {
      await handleSaveProject();
      showToast("Autosaved before starting a new workflow.", "success");
    }
    // Unnamed draft changes are discarded silently when starting a new workflow.

    // Clear the canvas
    setNodes([]);
    setEdges([]);
    setShowPanel(false);
    setCompiledJson(null);
    setBackendResult(null);
    setError(null);
    setLeafInputs([]);
    setInputValues({});
    setExecutionRecords([]);
    setInspectedNodeId(null);
    nodeSequenceCount.current = 0;
    setCurrentProjectId(null);
    setCurrentProjectName(null);
    lastSavedSnapshot.current = { nodeIds: '', edgeKeys: '' };
    showToast('✨ New workflow started!', 'success');
  };

  const handleSectionChange = useCallback(async (nextSection) => {
    if (nextSection === activeSection) return;

    // Guard for workspace -> saved-like navigation when current graph has unsaved work.
    const isSavedLikeTarget = nextSection === "saved" || nextSection === "saved_calculations";
    if (activeSection === "workspace" && isSavedLikeTarget && (nodes.length > 0 || edges.length > 0) && hasUnsavedChanges()) {
      if (currentProjectId) {
        const saved = await handleSaveProject();
        if (!saved) return;
        showToast("Autosaved before opening Saved Projects.", "success");
      }
    }

    setActiveSection(nextSection);
  }, [activeSection, nodes.length, edges.length, hasUnsavedChanges, currentProjectId, handleSaveProject]);

  const handleDeleteProject = async (projectId, projectName) => {
    const confirmed = await customConfirm('Delete Project', `Delete "${projectName}"? This cannot be undone.`);
    if (!confirmed) return;
    setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
    // If we just deleted the active project, clear tracking
    if (currentProjectId === projectId) {
      setCurrentProjectId(null);
      setCurrentProjectName(null);
    }
  };

  const handleRenameProject = async (projectId, oldName) => {
    const newName = await customPrompt('Rename project', 'Enter a new name:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    setSavedProjects((prev) =>
      prev.map((p) => p.id === projectId ? { ...p, name: newName.trim() } : p)
    );
    // Sync with active project tracking
    if (currentProjectId === projectId) setCurrentProjectName(newName.trim());
    showToast(`RENAME // "${newName.trim()}" updated`, 'success');
  };

  const handleUpdateProjectMeta = (projectId, field, value) => {
    setSavedProjects((prev) =>
      prev.map((p) => p.id === projectId ? { ...p, [field]: value } : p)
    );
  };

  const handleDuplicateProject = (project) => {
    const copy = {
      ...project,
      executionRecords: structuredClone(project.executionRecords || []),
      id: Date.now().toString(),
      name: `${project.name} (Copy)`,
      savedAt: new Date().toISOString(),
    };
    setSavedProjects((prev) => [copy, ...prev]);
    showToast(`📋 Duplicated "${project.name}"`, 'success');
  };

  const handleLoadTemplate = async (template) => {
    const canProceed = await confirmProceedWithPotentialDataLoss(`loading template "${template.name}"`);
    if (!canProceed) return;

    if (nodes.length > 0 || edges.length > 0) {
      const confirmed = await customConfirm('Load Template', `This will replace your current canvas with the "${template.name}" template. Continue?`);
      if (!confirmed) return;
    }
    const idMap = new Map();
    const convertedNodes = template.nodes.map((tplNode) => {
      nodeSequenceCount.current += 1;
      const mappedId = `node_${nodeSequenceCount.current}`;
      idMap.set(tplNode.id, mappedId);
      const derivedKey = getTemplateComponentKey(template.id, tplNode.id);
      const componentType = derivedKey || tplNode.type;
      const componentConfig = ComponentRegistry[componentType] || {};
      const label = tplNode.data?.label || componentConfig.label || componentType;
      return {
        id: mappedId,
        type: 'customNode',
        position: { ...tplNode.position },
        data: {
          ...tplNode.data,
          displayName: tplNode.data?.displayName || label,
          label,
          type: componentType,
          customIcon: resolveNodeIcon({
            customIcon: tplNode.data?.customIcon || "",
            configIcon: componentConfig.icon || "",
            type: componentType,
            label,
          }),
        },
      };
    });
    const edgeTimestamp = Date.now();
    const convertedEdges = template.edges
      .map((tplEdge, index) => {
        const source = idMap.get(tplEdge.source);
        const target = idMap.get(tplEdge.target);
        if (!source || !target) return null;
        return {
          id: `edge_${edgeTimestamp}_${index}`,
          source,
          sourceHandle: tplEdge.sourceHandle,
          target,
          targetHandle: tplEdge.targetHandle,
        };
      })
      .filter(Boolean);
    const normalizedEdges = normalizeCanvasEdges(convertedEdges);
    setNodes(convertedNodes);
    setEdges(normalizedEdges);
    setShowPanel(false); setCompiledJson(null); setBackendResult(null);
    setExecutionRecords([]);
    setError(null); setActiveSection("workspace");
    // Template = new unsaved work, not an existing project

    setCurrentProjectId(null);
    setCurrentProjectName(template.name);
    lastSavedSnapshot.current = makeSnapshotKeys(convertedNodes, normalizedEdges);
    showToast(`📝 Loaded template "${template.name}"`, "success");
  };

  function showToast(message, type = "error") {
    setConnectionToast({ message, type });
    setTimeout(() => setConnectionToast(null), 3000);
  }

  const fetchExternalDevices = useCallback(async () => {
    setDevicesError(null);
    setDevicesLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const baseUrl = (agentUrl || "").replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/devices`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Agent error ${res.status}`);
      const data = await res.json();
      setExternalDevices(data);
    } catch (err) {
      setExternalDevices(null);
      setDevicesError(err?.message || "Agent not reachable");
    } finally {
      setDevicesLoading(false);
    }
  }, [agentUrl]);

  useEffect(() => {
    if (activeSection === "external_devices") {
      fetchExternalDevices();
    }
  }, [activeSection, fetchExternalDevices]);

  const getExportFileBaseName = useCallback(() => {
    const base = (currentProjectName || "tatvalabz_workflow")
      .toString()
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return base || "tatvalabz_workflow";
  }, [currentProjectName]);

  const sanitizeExportName = useCallback((value, fallbackBase) => {
    const base = (value || fallbackBase || "tatvalabz_export")
      .toString()
      .trim()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return base || fallbackBase || "tatvalabz_export";
  }, []);

  const downloadTextFile = useCallback((content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportCsv = useCallback(async () => {
    if (isPdfExporting || isCsvExporting) return;
    const timestampIso = new Date().toISOString();
    const stamp = timestampIso.replace(/[:.]/g, "-");
    const suggestedName = `${getExportFileBaseName()}_${stamp}.csv`;
    const requested = await customPrompt("Export CSV", "Enter CSV file name:", suggestedName);
    if (!requested) {
      setShowExportMenu(false);
      return;
    }

    const fileName = `${sanitizeExportName(requested, getExportFileBaseName())}.csv`;
    setIsCsvExporting(true);
    setShowExportMenu(false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const rows = [["section", "key", "value"]];
      rows.push(["meta", "project_name", currentProjectName || "Untitled workflow"]);
      rows.push(["meta", "exported_at", timestampIso]);
      rows.push(["meta", "node_count", String(nodes.length)]);
      rows.push(["meta", "edge_count", String(edges.length)]);
      rows.push(["meta", "scenario_count", String(scenarios.length)]);
      rows.push(["meta", "execution_record_count", String(executionRecords.length)]);

      nodes.forEach((node, index) => {
        rows.push(["node", `${index + 1}.id`, node.id]);
        rows.push(["node", `${index + 1}.label`, node?.data?.label || node.id]);
        rows.push(["node", `${index + 1}.type`, node.type || "customNode"]);
        rows.push(["node", `${index + 1}.x`, String(node?.position?.x ?? "")]);
        rows.push(["node", `${index + 1}.y`, String(node?.position?.y ?? "")]);
      });

      edges.forEach((edge, index) => {
        rows.push(["edge", `${index + 1}.id`, edge.id]);
        rows.push(["edge", `${index + 1}.source`, edge.source]);
        rows.push(["edge", `${index + 1}.target`, edge.target]);
        rows.push(["edge", `${index + 1}.source_handle`, edge.sourceHandle || ""]);
        rows.push(["edge", `${index + 1}.target_handle`, edge.targetHandle || ""]);
      });

      scenarios.forEach((scenario, index) => {
        rows.push(["scenario", `${index + 1}.id`, scenario.id || `scenario_${index + 1}`]);
        rows.push(["scenario", `${index + 1}.name`, scenario.name || `Scenario ${index + 1}`]);
        rows.push(["scenario", `${index + 1}.active`, String(Boolean(scenario.isActive))]);
        rows.push(["scenario", `${index + 1}.sweeps`, JSON.stringify(scenario.sweeps || {})]);
      });

      const systemState = backendResult?.system_state || {};
      Object.entries(systemState).forEach(([key, value]) => {
        rows.push(["system_state", key, String(value)]);
      });

      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

      downloadTextFile(csv, fileName, "text/csv;charset=utf-8;");
      showToast(`CSV downloaded: ${fileName}`, "success");
    } catch (err) {
      showToast(`CSV export failed: ${err?.message || err}`, "error");
    } finally {
      setIsCsvExporting(false);
    }
  }, [currentProjectName, nodes, edges, scenarios, executionRecords.length, backendResult, getExportFileBaseName, sanitizeExportName, downloadTextFile, showToast, isPdfExporting, isCsvExporting]);

  const handleExportPdf = useCallback(async () => {
    if (isPdfExporting) return;
    const timestampIso = new Date().toISOString();
    const stamp = timestampIso.replace(/[:.]/g, "-");
    const suggestedName = `${getExportFileBaseName()}_${stamp}.pdf`;
    const requested = await customPrompt("Export PDF", "Enter PDF file name:", suggestedName);
    if (!requested) {
      setShowExportMenu(false);
      return;
    }

    const fileName = `${sanitizeExportName(requested, getExportFileBaseName())}.pdf`;
    const precisionRaw = await customPrompt(
      "Display Precision",
      "Set report-body decimal places (0-10). Layered Value Ledger keeps full precision.",
      "4"
    );
    if (precisionRaw === null) {
      setShowExportMenu(false);
      return;
    }
    const parsedPrecision = Number.parseInt(String(precisionRaw).trim(), 10);
    const displayPrecision = Number.isNaN(parsedPrecision) ? 4 : Math.max(0, Math.min(10, parsedPrecision));
    setIsPdfExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const safeHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const prettyLabel = (raw) =>
      String(raw || "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (m) => m.toUpperCase());

    const toPrecise = (value) => {
      if (value === undefined) return "undefined";
      if (value === null) return "null";
      if (typeof value === "number") {
        if (Number.isNaN(value)) return "NaN";
        if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
        return Number(value).toPrecision(17);
      }
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const toDisplay = (value) => {
      if (value === undefined) return "undefined";
      if (value === null) return "null";
      if (typeof value === "number") {
        if (Number.isNaN(value)) return "NaN";
        if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
        return Number(value).toFixed(displayPrecision);
      }
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const formulaReserved = new Set([
      "Math", "sqrt", "abs", "max", "min", "pow", "sin", "cos", "tan", "log", "exp", "round",
    ]);
    const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const extractVariables = (formula) => {
      const matches = String(formula).match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
      return [...new Set(matches.filter((token) => !formulaReserved.has(token)))];
    };
    const renderExpression = (expr) => {
      const tokens = String(expr || "").match(/([A-Za-z_][A-Za-z0-9_]*|-?\d+\.\d+e[+-]?\d+|-?\d+\.\d+|-?\d+|<=|>=|==|!=|\|\||&&|[+\-*/^()=,<>\[\]])/gi) || [];
      return tokens.map((token) => {
        const escaped = safeHtml(token);
        if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(token)) return `<span class="tok-num">${escaped}</span>`;
        if (/^(<=|>=|==|!=|\|\||&&|[+\-*/^()=,<>\[\]])$/.test(token)) return `<span class="tok-op">${escaped}</span>`;
        if (formulaReserved.has(token)) return `<span class="tok-fn">${escaped}</span>`;
        return `<span class="tok-var">${escaped}</span>`;
      }).join(" ");
    };

    const compiledNodes = Array.isArray(compiledJson?.nodes) ? compiledJson.nodes : [];
    const nodeById = new Map(compiledNodes.map((node) => [node.id, node]));
    const uiNodeById = new Map(nodes.map((node) => [node.id, node]));
    const sortedNodeIds = [...new Set(compiledNodes.map((n) => n.id))].sort((a, b) => b.length - a.length);
    if (compiledNodes.length === 0) {
      nodes.forEach((n) => {
        nodeById.set(n.id, {
          id: n.id,
          label: n?.data?.label || n.id,
          formulas: n?.data?.formulas || {},
          inputs_mapped: n?.data?.inputs_mapped || {},
          execution_layer: 0,
        });
      });
    }

    const parseSourceRef = (sourceRef) => {
      if (!sourceRef) return null;
      for (const nodeId of sortedNodeIds) {
        const prefix = `${nodeId}_`;
        if (sourceRef.startsWith(prefix)) {
          return { nodeId, outputName: sourceRef.slice(prefix.length) };
        }
      }
      return null;
    };
    const getNodeName = (nodeId) => {
      const compiled = nodeById.get(nodeId);
      const uiNode = uiNodeById.get(nodeId);
      const rawLabel =
        compiled?.label ||
        compiled?.name ||
        uiNode?.data?.label ||
        uiNode?.data?.name ||
        "Unnamed Component";
      return prettyLabel(rawLabel);
    };
    const getNodeDescription = (nodeId, nodeObj = null) => {
      const uiNode = uiNodeById.get(nodeId);
      const candidates = [
        nodeObj?.description,
        nodeObj?.desc,
        uiNode?.data?.description,
        uiNode?.data?.desc,
        uiNode?.data?.notes,
        uiNode?.data?.summary,
      ];
      const found = candidates.find((item) => typeof item === "string" && item.trim());
      return found ? found.trim() : "";
    };
    const humanizeSystemField = (key) => {
      let value = String(key || "");
      sortedNodeIds.forEach((nodeId) => {
        const rx = new RegExp(`\\b${escapeRegExp(nodeId)}\\b`, "g");
        value = value.replace(rx, getNodeName(nodeId));
      });
      value = value.replace(/\bnode_\d+\b/gi, "Component");
      return prettyLabel(value);
    };
    const prettySource = (source) => {
      if (!source) return "Unresolved fallback";
      if (source.startsWith("mapped:")) {
        const right = source.replace("mapped:", "");
        const [node, output] = right.split(".");
        return `Mapped from ${getNodeName(node)} -> ${prettyLabel(output)}`;
      }
      if (source.startsWith("global:")) return `Global constant (${prettyLabel(source.replace("global:", ""))})`;
      if (source.startsWith("local:")) {
        const right = source.replace("local:", "");
        const [nodeId, outputName] = right.split(".");
        return `Local output (${getNodeName(nodeId)} -> ${prettyLabel(outputName)})`;
      }
      if (source.startsWith("scoped:")) {
        const right = source.replace("scoped:", "");
        const [nodeId, outputName] = right.includes("__") ? right.split("__") : right.split("_");
        if (nodeId) return `Scoped value (${getNodeName(nodeId)} -> ${prettyLabel(outputName)})`;
        return `Scoped system value (${prettyLabel(right)})`;
      }
      return prettyLabel(source).replace(/\bNode\s+\d+\b/g, "Component");
    };

    const layerToNodeIds = new Map();
    if (Array.isArray(compiledJson?.execution_batches) && compiledJson.execution_batches.length > 0) {
      compiledJson.execution_batches.forEach((batch) => {
        const layer = Number(batch.layer ?? 0);
        const ids = Array.isArray(batch.node_ids) ? batch.node_ids : [];
        if (!layerToNodeIds.has(layer)) layerToNodeIds.set(layer, []);
        layerToNodeIds.get(layer).push(...ids);
      });
    } else if (compiledNodes.length > 0) {
      compiledNodes.forEach((node) => {
        const layer = Number(node.execution_layer ?? 0);
        if (!layerToNodeIds.has(layer)) layerToNodeIds.set(layer, []);
        layerToNodeIds.get(layer).push(node.id);
      });
    } else if (nodes.length > 0) {
      layerToNodeIds.set(0, nodes.map((n) => n.id));
    }
    const orderedLayers = [...layerToNodeIds.keys()].sort((a, b) => a - b);
    orderedLayers.forEach((layer) => {
      const ids = layerToNodeIds.get(layer) || [];
      layerToNodeIds.set(layer, Array.from(new Set(ids)));
    });
    const nodeLayerById = new Map();
    orderedLayers.forEach((layer) => {
      (layerToNodeIds.get(layer) || []).forEach((nodeId) => {
        nodeLayerById.set(nodeId, layer);
      });
    });
    const getSystemFieldLayer = (key) => {
      const raw = String(key || "");
      for (const nodeId of sortedNodeIds) {
        if (raw.includes(`${nodeId}_`) || raw.includes(`${nodeId}__`) || raw === nodeId) {
          return nodeLayerById.get(nodeId) ?? null;
        }
      }
      return null;
    };

    const buildVariants = () => {
      const variants = [];
      if (backendResult?.node_outputs && backendResult?.system_state) {
        variants.push({
          id: "baseline",
          label: "Baseline Run",
          sweepSummary: "",
          nodeOutputs: backendResult.node_outputs,
          systemState: backendResult.system_state,
        });
      }
      const scenarioResults = Array.isArray(backendResult?.scenario_results) ? backendResult.scenario_results : [];
      scenarioResults.forEach((scenario) => {
        const outputsList = Array.isArray(scenario?.data_points) ? scenario.data_points : [];
        const stateList = Array.isArray(scenario?.system_states) ? scenario.system_states : [];
        const sweepVars = Array.isArray(scenario?.sweep_variables) ? scenario.sweep_variables : [];
        const sweepValues = Array.isArray(scenario?.sweep_values) ? scenario.sweep_values : [];
        outputsList.forEach((nodeOutputs, idx) => {
          const runVals = sweepValues[idx];
          const sweepSummary = Array.isArray(runVals)
            ? sweepVars.map((name, i) => `${prettyLabel(name)}=${toPrecise(runVals[i])}`).join(" | ")
            : "";
          variants.push({
            id: `${scenario?.scenario_id || "scenario"}_${idx + 1}`,
            label: `${scenario?.scenario_name || "Scenario"} - Iteration ${idx + 1}/${outputsList.length || 1}`,
            sweepSummary,
            nodeOutputs: nodeOutputs || {},
            systemState: stateList[idx] || {},
          });
        });
      });

      if (!scenarioResults.length && Array.isArray(backendResult?.data_points)) {
        const outputsList = backendResult.data_points;
        const stateList = Array.isArray(backendResult?.system_states) ? backendResult.system_states : [];
        outputsList.forEach((nodeOutputs, idx) => {
          variants.push({
            id: `sweep_${idx + 1}`,
            label: `Sweep Iteration ${idx + 1}/${outputsList.length || 1}`,
            sweepSummary: "",
            nodeOutputs: nodeOutputs || {},
            systemState: stateList[idx] || {},
          });
        });
      }
      return variants;
    };
    const variants = buildVariants();

    const buildFormulaAudit = (nodeId, outputName, formula, inputsMapped, variantNodeOutputs, variantSystemState) => {
      const variableNames = extractVariables(formula);
      const substitutions = {};

      variableNames.forEach((varName) => {
        let value;
        let source = "unresolved(default)";
        const mappedSourceRef = inputsMapped[varName];
        if (mappedSourceRef) {
          const parsed = parseSourceRef(mappedSourceRef);
          if (parsed) {
            value = variantNodeOutputs?.[parsed.nodeId]?.[parsed.outputName];
            if (value === undefined) value = variantSystemState?.[`${parsed.nodeId}_${parsed.outputName}`];
            source = `mapped:${parsed.nodeId}.${parsed.outputName}`;
          }
        }
        if (value === undefined && variantNodeOutputs?.[nodeId]?.[varName] !== undefined) {
          value = variantNodeOutputs[nodeId][varName];
          source = `local:${nodeId}.${varName}`;
        }
        if (value === undefined && variantSystemState?.[`${nodeId}__${varName}`] !== undefined) {
          value = variantSystemState[`${nodeId}__${varName}`];
          source = `scoped:${nodeId}__${varName}`;
        }
        if (value === undefined && variantSystemState?.[`${nodeId}_${varName}`] !== undefined) {
          value = variantSystemState[`${nodeId}_${varName}`];
          source = `scoped:${nodeId}_${varName}`;
        }
        if (value === undefined && variantSystemState?.[varName] !== undefined) {
          value = variantSystemState[varName];
          source = `global:${varName}`;
        }
        if (value === undefined) value = 0;
        substitutions[varName] = { value, source };
      });

      let expanded = String(formula || "");
      Object.keys(substitutions).sort((a, b) => b.length - a.length).forEach((varName) => {
        const displayValue = toDisplay(substitutions[varName].value);
        const wrapped = displayValue.startsWith("-") ? `(${displayValue})` : displayValue;
        expanded = expanded.replace(new RegExp(`\\b${escapeRegExp(varName)}\\b`, "g"), wrapped);
      });

      let outcome = variantNodeOutputs?.[nodeId]?.[outputName];
      if (outcome === undefined) outcome = variantSystemState?.[`${nodeId}_${outputName}`];
      if (outcome === undefined) outcome = variantSystemState?.[outputName];

      return { substitutions, expanded, outcome };
    };

    const variantBlocksHtml = variants.map((variant) => {
      const variantNodeOutputs = variant.nodeOutputs || {};
      const variantSystemState = variant.systemState || {};

      const layerBlocks = orderedLayers.map((layer) => {
        const nodeIds = layerToNodeIds.get(layer) || [];
        const nodeCards = nodeIds.map((nodeId) => {
          const node = nodeById.get(nodeId) || {};
          const nodeLabel = getNodeName(nodeId);
          const nodeDescription = getNodeDescription(nodeId, node);
          const formulas = Object.entries(node?.formulas || {});
          const inputsMapped = node?.inputs_mapped || {};

          const formulaCards = formulas.map(([outputName, formula], formulaIndex) => {
            const audit = buildFormulaAudit(nodeId, outputName, formula, inputsMapped, variantNodeOutputs, variantSystemState);
            const sourceRows = Array.from(
              new Set(Object.values(audit.substitutions).map((data) => prettySource(data.source)))
            ).map((sourceName) => `
              <tr>
                <td>${safeHtml(sourceName)}</td>
              </tr>
            `).join("");
            return `
              <article class="formula-card">
                <div class="formula-head">
                  <span class="formula-index">Formula ${formulaIndex + 1}</span>
                  <span class="formula-out">${safeHtml(prettyLabel(outputName))}</span>
                </div>
                <div class="expr-row">
                  <span class="lhs mono">${safeHtml(outputName)}</span>
                  <span class="eq">=</span>
                  <span class="rhs mono">${renderExpression(formula)}</span>
                </div>
                <div class="expr-row soft">
                  <span class="lhs mono">${safeHtml(outputName)}</span>
                  <span class="eq">=</span>
                  <span class="rhs mono">${renderExpression(audit.expanded)}</span>
                </div>
                <table class="clean-table dense">
                  <thead><tr><th>Source Mapping</th></tr></thead>
                  <tbody>${sourceRows || `<tr><td>No sources resolved</td></tr>`}</tbody>
                </table>
                <div class="outcome">
                  <span>Outcome</span>
                  <strong class="mono">${safeHtml(toDisplay(audit.outcome))}</strong>
                </div>
              </article>
            `;
          }).join("");

          return `
            <section class="node-card">
              <div class="node-head">
                <h5>${safeHtml(nodeLabel)}</h5>
              </div>
              ${nodeDescription ? `<p class="node-desc">${safeHtml(nodeDescription)}</p>` : ""}
              ${formulaCards || `<div class="muted-box">No formulas defined for this component.</div>`}
            </section>
          `;
        }).join("");

        return `
          <section class="layer-block pdf-block must-fit-page">
            <div class="layer-head">
              <h4>Layer ${layer}</h4>
              <div class="layer-chip">${nodeIds.length} component(s)</div>
            </div>
            ${nodeCards || `<div class="muted-box">No nodes in this layer.</div>`}
          </section>
        `;
      }).join("");

      return `
        <section class="variant">
          <div class="variant-head pdf-block">
            <h3>${safeHtml(variant.label)}</h3>
            ${variant.sweepSummary ? `<p>${safeHtml(variant.sweepSummary)}</p>` : ""}
          </div>
          ${layerBlocks || `<div class="muted-box pdf-block">No computational trace available.</div>`}
        </section>
      `;
    }).join("");

    const appendixHtml = variants.map((variant) => {
      const grouped = new Map();
      Object.entries(variant.systemState || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, value]) => {
          const layer = getSystemFieldLayer(key);
          const groupName = layer === null ? "Shared System Values" : `Layer ${layer}`;
          if (!grouped.has(groupName)) grouped.set(groupName, []);
          grouped.get(groupName).push({
            field: humanizeSystemField(key),
            value: toPrecise(value),
          });
        });

      const orderedGroupNames = [
        ...orderedLayers.map((layer) => `Layer ${layer}`).filter((name) => grouped.has(name)),
        ...Array.from(grouped.keys()).filter((name) => !name.startsWith("Layer ")),
      ];
      const groupsHtml = orderedGroupNames.map((groupName) => {
        const rows = (grouped.get(groupName) || []).map((row) => `
          <tr>
            <td>${safeHtml(row.field)}</td>
            <td class="mono appendix-value">${safeHtml(row.value)}</td>
          </tr>
        `).join("");
        return `
          <div class="appendix-group">
            <div class="appendix-group-title">${safeHtml(groupName)}</div>
            <table class="clean-table dense appendix-table">
              <thead><tr><th>Signal</th><th>Computed Value</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="2">No values</td></tr>`}</tbody>
            </table>
          </div>
        `;
      }).join("");

      return `
        <section class="state-block pdf-block">
          <h4>${safeHtml(variant.label)} Layered Value Ledger</h4>
          ${groupsHtml || `<div class="muted-box">No values available.</div>`}
        </section>
      `;
    }).join("");

    const summaryCard = (label, value) => `
      <div class="summary-card">
        <div class="summary-label">${safeHtml(label)}</div>
        <div class="summary-value">${safeHtml(value)}</div>
      </div>
    `;

    const buildFlowMapSvg = () => {
      if (!Array.isArray(nodes) || nodes.length === 0) {
        return `<div class="muted-box">Flow map unavailable: no nodes on canvas.</div>`;
      }

      const svgW = 980;
      const svgH = 260;
      const pad = 24;
      const nodeW = 132;
      const nodeH = 38;
      const positioned = nodes.map((n, idx) => ({
        id: n.id,
        label: prettyLabel(n?.data?.label || n?.data?.name || "Unnamed Component"),
        x: Number(n?.position?.x ?? idx * 120),
        y: Number(n?.position?.y ?? 0),
      }));
      const minX = Math.min(...positioned.map((n) => n.x));
      const maxX = Math.max(...positioned.map((n) => n.x));
      const minY = Math.min(...positioned.map((n) => n.y));
      const maxY = Math.max(...positioned.map((n) => n.y));
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const projected = new Map(
        positioned.map((n) => {
          const px = pad + ((n.x - minX) / spanX) * (svgW - pad * 2 - nodeW);
          const py = pad + ((n.y - minY) / spanY) * (svgH - pad * 2 - nodeH);
          return [n.id, { ...n, px, py }];
        })
      );

      const edgeSvg = edges.map((e) => {
        const s = projected.get(e.source);
        const t = projected.get(e.target);
        if (!s || !t) return "";
        const x1 = s.px + nodeW;
        const y1 = s.py + nodeH / 2;
        const x2 = t.px;
        const y2 = t.py + nodeH / 2;
        const cx = (x1 + x2) / 2;
        const linkLabel = `${prettyLabel(e.sourceHandle || "out")} -> ${prettyLabel(e.targetHandle || "in")}`;
        return `
          <path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx.toFixed(1)} ${y1.toFixed(1)}, ${cx.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}"
            stroke="#ff8a3d" stroke-width="1.6" fill="none" marker-end="url(#flowArrow)" opacity="0.95"/>
          <text x="${((x1 + x2) / 2).toFixed(1)}" y="${(Math.min(y1, y2) - 4).toFixed(1)}" class="flow-edge-label">${safeHtml(linkLabel)}</text>
        `;
      }).join("");

      const nodeSvg = [...projected.values()].map((n) => `
        <rect x="${n.px.toFixed(1)}" y="${n.py.toFixed(1)}" width="${nodeW}" height="${nodeH}" rx="8" ry="8" fill="#111c2b" stroke="#32b8ff" stroke-width="1.2"/>
        <rect x="${n.px.toFixed(1)}" y="${n.py.toFixed(1)}" width="${nodeW}" height="11" rx="8" ry="8" fill="#17385e"/>
        <text x="${(n.px + 7).toFixed(1)}" y="${(n.py + 22).toFixed(1)}" class="flow-node-label">${safeHtml(n.label.slice(0, 24))}</text>
      `).join("");

      return `
        <svg class="flow-map-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="flowArrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill="#ff8a3d"></polygon>
            </marker>
          </defs>
          <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#0d1521" />
          ${edgeSvg}
          ${nodeSvg}
        </svg>
      `;
    };

    const reportHtml = `
      <div class="report-wrap">
        <style>
          .report-wrap {
            font-family: "Inter", "Segoe UI", Arial, sans-serif;
            color: #d8e4f5;
            background: linear-gradient(180deg, #0b1118 0%, #0f1824 100%);
            padding: 18px 24px 24px;
          }
          .hero {
            border: 1px solid rgba(50, 184, 255, 0.35);
            border-radius: 12px;
            background: linear-gradient(135deg, #0e1d2d, #12314f);
            padding: 16px;
            margin-bottom: 10px;
          }
          .pdf-block {
            width: 100%;
            box-sizing: border-box;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .hero h1 { margin: 0; font-size: 18px; color: #f3f9ff; }
          .hero p { margin: 6px 0 0; font-size: 11px; color: #bfd7f1; }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 12px;
          }
          .summary-card {
            border: 1px solid rgba(73, 113, 154, 0.5);
            border-left: 4px solid #32b8ff;
            border-radius: 8px;
            background: #101c2a;
            padding: 8px 10px;
          }
          .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #88b2df; margin-bottom: 4px; }
          .summary-value { font-size: 15px; font-weight: 800; color: #f4fbff; }
          h2 {
            font-size: 13px;
            margin: 0;
            color: #7fc7ff;
            text-transform: uppercase;
            letter-spacing: .05em;
          }
          .section-title {
            border: 1px solid rgba(67, 105, 142, 0.45);
            border-radius: 8px;
            background: #0f1b2a;
            padding: 7px 9px;
            margin: 10px 0 7px;
          }
          .section-note {
            margin-bottom: 8px;
          }
          .flow-map {
            border: 1px solid rgba(68, 108, 146, 0.45);
            border-radius: 10px;
            padding: 6px;
            background: #0d1724;
            margin-bottom: 8px;
          }
          .flow-map-svg {
            width: 100%;
            height: auto;
            border-radius: 8px;
            display: block;
          }
          .flow-edge-label {
            fill: #f5bd95;
            font-size: 8px;
            font-weight: 600;
            text-anchor: middle;
            font-family: "JetBrains Mono", "Fira Code", "Consolas", "SFMono-Regular", monospace;
          }
          .flow-node-label {
            fill: #f0f7ff;
            font-size: 8px;
            font-weight: 700;
            font-family: "Inter", "Segoe UI", Arial, sans-serif;
          }
          h3 { margin: 0 0 4px 0; font-size: 12px; color: #ecf6ff; }
          h4 { margin: 0 0 7px 0; font-size: 11px; color: #9cd3ff; }
          h5 { margin: 0; font-size: 10.5px; color: #e8f2ff; }
          .variant, .layer-block, .node-card, .formula-card, .state-block {
            border: 1px solid rgba(66, 104, 141, 0.45);
            border-radius: 9px;
            background: #101a27;
            padding: 10px;
            margin-bottom: 10px;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .variant-head p { margin: 0 0 3px; font-size: 9px; color: #9dbcdc; }
          .variant-head {
            border: 1px solid rgba(72, 112, 149, 0.42);
            border-radius: 8px;
            padding: 8px 10px;
            background: #122132;
            margin-bottom: 9px;
          }
          .layer-head {
            border: 1px solid rgba(72, 112, 149, 0.36);
            border-radius: 8px;
            padding: 8px 10px;
            background: #122031;
            margin-bottom: 10px;
          }
          .layer-chip {
            display: inline-block;
            font-size: 9px;
            border: 1px solid rgba(50, 184, 255, 0.4);
            color: #8ed3ff;
            background: rgba(50, 184, 255, 0.08);
            padding: 2px 8px;
            border-radius: 999px;
            margin-bottom: 7px;
          }
          .node-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 9px;
            border-radius: 6px;
            background: linear-gradient(90deg, rgba(50, 184, 255, 0.2), rgba(255, 138, 61, 0.12));
            border: 1px solid rgba(100, 140, 178, 0.35);
            margin-bottom: 8px;
          }
          .node-desc {
            margin: 0 0 8px;
            font-size: 9px;
            color: #a8c4df;
            line-height: 1.4;
            border-left: 2px solid rgba(50, 184, 255, 0.35);
            padding-left: 7px;
          }
          .formula-card { background: #0f1b29; }
          .formula-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
          }
          .formula-index { font-size: 9px; color: #9ec4ea; text-transform: uppercase; letter-spacing: .08em; }
          .formula-out { font-size: 10px; color: #e2f2ff; font-weight: 700; }
          .expr-row {
            display: grid;
            grid-template-columns: 100px 14px 1fr;
            gap: 6px;
            border: 1px solid rgba(73, 116, 162, 0.45);
            border-radius: 6px;
            background: #0d1724;
            padding: 7px;
            margin-bottom: 6px;
            font-size: 9.2px;
            line-height: 1.4;
          }
          .expr-row.soft { background: #112033; }
          .lhs { color: #8fc9ff; text-align: right; font-weight: 700; }
          .eq { color: #ff8a3d; text-align: center; font-weight: 800; }
          .rhs { color: #f0f8ff; }
          .tok-var { color: #32b8ff; font-weight: 700; }
          .tok-num { color: #ffffff; font-weight: 700; }
          .tok-op { color: #ff8a3d; font-weight: 700; }
          .tok-fn { color: #f8d180; font-weight: 700; }
          .mono { font-family: "JetBrains Mono", "Fira Code", "Consolas", "SFMono-Regular", monospace; }
          .clean-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
          .clean-table th, .clean-table td {
            border: 1px solid rgba(78, 112, 148, 0.45);
            padding: 6px 7px;
            font-size: 9px;
            vertical-align: top;
            color: #dbe8f8;
          }
          .clean-table th { background: #172639; color: #95cbff; text-align: left; }
          .clean-table tr:nth-child(even) td { background: #121f30; }
          .appendix-group {
            margin-top: 10px;
          }
          .appendix-group-title {
            font-size: 10.5px;
            font-weight: 700;
            color: #9cd3ff;
            margin: 0 0 6px;
            letter-spacing: .03em;
            text-transform: uppercase;
          }
          .appendix-table th, .appendix-table td {
            font-size: 10.5px;
            padding: 8px 9px;
          }
          .appendix-value {
            font-size: 11px;
            font-weight: 700;
          }
          .outcome {
            margin-top: 6px;
            border: 1px solid rgba(255, 138, 61, 0.5);
            border-radius: 6px;
            background: linear-gradient(90deg, rgba(255, 138, 61, 0.14), rgba(50, 184, 255, 0.08));
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 6px;
          }
          .outcome span {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: #ffd4bb;
          }
          .outcome strong {
            color: #ff8a3d;
            font-size: 12px;
            font-weight: 900;
          }
          .muted-box {
            font-size: 9px;
            color: #9ab7d6;
            border: 1px dashed rgba(101, 136, 171, 0.55);
            border-radius: 6px;
            padding: 8px;
            background: #0f1a2a;
          }
          .section-break {
            break-before: page;
            page-break-before: always;
          }
          @page { margin: 24px 20px; }
        </style>

        <div class="hero pdf-block">
          <h1>TatvaLabz Engineering Computation Report</h1>
          <p>Project: ${safeHtml(currentProjectName || "Untitled Workflow")} | Exported: ${safeHtml(timestampIso)}</p>
        </div>

        <div class="summary-grid pdf-block">
          ${summaryCard("Components", String(compiledNodes.length || nodes.length))}
          ${summaryCard("Layers", String(orderedLayers.length || 0))}
          ${summaryCard("Runs", String(variants.length || 0))}
        </div>

        <div class="section-title pdf-block"><h2>0. Node Flow Map</h2></div>
        <div class="flow-map pdf-block">${buildFlowMapSvg()}</div>

        <div class="section-title pdf-block"><h2>1. Layered Computational Trace</h2></div>
        ${variantBlocksHtml || `<div class="muted-box pdf-block">No execution data found. Run Execute first.</div>`}

        <div class="section-title section-break pdf-block"><h2>2. Layered Value Ledger</h2></div>
        <div class="muted-box section-note pdf-block" style="margin-bottom: 8px;">
          Values are grouped by execution layer for faster review. Numeric outputs keep full 17-digit precision.
        </div>
        ${appendixHtml || `<div class="muted-box pdf-block">No raw system-state data available.</div>`}
      </div>
    `;

    let container = null;
    try {
      container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "0";
      container.style.top = "0";
      container.style.width = "1100px";
      container.style.background = "#0b1118";
      container.style.zIndex = "-2147483647";
      container.style.pointerEvents = "none";
      container.innerHTML = reportHtml;
      document.body.appendChild(container);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      doc.setProperties({
        title: `TatvaLabz Engineering Export - ${currentProjectName || "Untitled workflow"}`,
        subject: "Graphic card computational report",
        author: "TatvaLabz",
        creator: "TatvaLabz WebApp",
      });

      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 120));

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 20;
      const marginY = 24;
      const contentWidth = pageWidth - marginX * 2;
      const contentHeight = pageHeight - marginY * 2;
      const drawPageBackground = () => {
        doc.setFillColor(11, 17, 24);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
      };
      const addNewPage = () => {
        doc.addPage();
        drawPageBackground();
      };
      const sliceCanvas = (canvas, fromY, height) => {
        const piece = document.createElement("canvas");
        piece.width = canvas.width;
        piece.height = height;
        const pctx = piece.getContext("2d");
        if (!pctx) throw new Error("Unable to create PDF slice context");
        pctx.drawImage(
          canvas,
          0,
          fromY,
          canvas.width,
          height,
          0,
          0,
          canvas.width,
          height
        );
        return piece;
      };

      const blockSelector = [
        ".hero.pdf-block",
        ".summary-grid.pdf-block",
        ".section-title.pdf-block",
        ".flow-map.pdf-block",
        ".section-note.pdf-block",
        ".variant-head.pdf-block",
        ".layer-block.pdf-block",
        ".state-block.pdf-block",
        ".muted-box.pdf-block",
      ].join(", ");
      const exportBlocks = Array.from(container.querySelectorAll(blockSelector));
      if (exportBlocks.length === 0) {
        throw new Error("No export blocks found for pagination");
      }

      let yCursor = marginY;
      drawPageBackground();
      const blockGap = 4;
      const minRenderableSpacePt = 24;
      const layerKeepTogetherLimitPt = contentHeight * 0.82;

      const renderCanvasSliced = (canvas) => {
        let consumedPx = 0;
        while (consumedPx < canvas.height) {
          const spaceLeftPt = pageHeight - marginY - yCursor;
          if (spaceLeftPt < minRenderableSpacePt) {
            addNewPage();
            yCursor = marginY;
          }

          const usablePt = pageHeight - marginY - yCursor;
          const sliceHeightPx = Math.max(1, Math.floor((usablePt * canvas.width) / contentWidth));
          const remainPx = canvas.height - consumedPx;
          const takePx = Math.min(sliceHeightPx, remainPx);
          const piece = sliceCanvas(canvas, consumedPx, takePx);
          const renderedHeightPt = (takePx * contentWidth) / canvas.width;
          const pieceImage = piece.toDataURL("image/png", 1.0);
          doc.addImage(pieceImage, "PNG", marginX, yCursor, contentWidth, renderedHeightPt, undefined, "FAST");
          consumedPx += takePx;
          yCursor += renderedHeightPt;

          if (consumedPx < canvas.height) {
            addNewPage();
            yCursor = marginY;
          } else {
            yCursor += blockGap;
          }
        }
      };

      for (const block of exportBlocks) {
        if (block.classList.contains("section-break") && yCursor !== marginY) {
          addNewPage();
          yCursor = marginY;
        }

        const blockCanvas = await html2canvas(block, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#0b1118",
          logging: false,
          windowWidth: Math.max(container.scrollWidth, 1100),
        });
        if (!blockCanvas.width || !blockCanvas.height) continue;

        const fullBlockHeightPt = (blockCanvas.height * contentWidth) / blockCanvas.width;
        const mustFitPage = block.classList.contains("must-fit-page");
        if (mustFitPage) {
          const spaceLeftPt = pageHeight - marginY - yCursor;
          const keepTogether = fullBlockHeightPt <= layerKeepTogetherLimitPt;
          if (keepTogether) {
            if (yCursor !== marginY && fullBlockHeightPt > spaceLeftPt) {
              addNewPage();
              yCursor = marginY;
            }
            const blockImage = blockCanvas.toDataURL("image/png", 1.0);
            doc.addImage(blockImage, "PNG", marginX, yCursor, contentWidth, fullBlockHeightPt, undefined, "FAST");
            yCursor += fullBlockHeightPt + blockGap;
          } else {
            if (yCursor !== marginY && spaceLeftPt < contentHeight * 0.32) {
              addNewPage();
              yCursor = marginY;
            }
            renderCanvasSliced(blockCanvas);
          }
          continue;
        }

        if (fullBlockHeightPt <= (pageHeight - marginY - yCursor)) {
          const blockImage = blockCanvas.toDataURL("image/png", 1.0);
          doc.addImage(blockImage, "PNG", marginX, yCursor, contentWidth, fullBlockHeightPt, undefined, "FAST");
          yCursor += fullBlockHeightPt + blockGap;
          continue;
        }

        if (fullBlockHeightPt <= contentHeight) {
          addNewPage();
          yCursor = marginY;
          const blockImage = blockCanvas.toDataURL("image/png", 1.0);
          doc.addImage(blockImage, "PNG", marginX, yCursor, contentWidth, fullBlockHeightPt, undefined, "FAST");
          yCursor += fullBlockHeightPt + blockGap;
          continue;
        }

        renderCanvasSliced(blockCanvas);
      }

      doc.save(fileName);
      showToast(`PDF downloaded: ${fileName}`, "success");
    } catch (err) {
      showToast(`PDF export failed: ${err?.message || err}`, "error");
    } finally {
      if (container?.parentNode) container.parentNode.removeChild(container);
      setShowExportMenu(false);
      setIsPdfExporting(false);
    }
  }, [currentProjectName, nodes, edges, backendResult, compiledJson, getExportFileBaseName, sanitizeExportName, showToast, isPdfExporting]);

  const wouldCreateCycle = useCallback((sourceId, targetId, currentEdges) => {
    const adjacency = {};
    currentEdges.forEach((e) => {
      if (!adjacency[e.source]) adjacency[e.source] = [];
      adjacency[e.source].push(e.target);
    });
    const visited = new Set();
    const queue = [targetId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      (adjacency[current] || []).forEach((neighbor) => queue.push(neighbor));
    }
    return false;
  }, []);

  const isValidConnection = useCallback(
    (connection) => {
      if (connection.source === connection.target) return false;
      const inputAlreadyConnected = edges.some(
        (e) => e.target === connection.target && e.targetHandle === connection.targetHandle
      );
      if (inputAlreadyConnected) return false;
      if (wouldCreateCycle(connection.source, connection.target, edges)) return false;
      return true;
    },
    [edges, wouldCreateCycle]
  );

  const onConnect = useCallback(
    (params) => {
      if (params.source === params.target) { showToast("❌ Cannot connect a node to itself"); return; }
      const inputAlreadyConnected = edges.some(
        (e) => e.target === params.target && e.targetHandle === params.targetHandle
      );
      if (inputAlreadyConnected) { showToast(`❌ Input "${params.targetHandle}" already has a connection — delete it first`); return; }
      if (wouldCreateCycle(params.source, params.target, edges)) { showToast("❌ Connection would create a circular dependency"); return; }
      setEdges((eds) => addEdge({ ...params, type: "deletable", animated: true, style: { stroke: "#22d3ee" } }, eds));
    },
    [setEdges, edges, wouldCreateCycle, showToast]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const componentType = event.dataTransfer.getData("application/reactflow");
      if (!componentType || !rfInstance) return;
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      setNodes((nds) => {
        // Initialize counter to highest known if it's currently 0 (first drop)
        if (nodeSequenceCount.current === 0) {
          let maxId = 0;
          nds.forEach((n) => {
            const match = n.id.match(/^node_(\d+)$/);
            if (match) maxId = Math.max(maxId, parseInt(match[1], 10));
          });
          nodeSequenceCount.current = maxId;
        }

        nodeSequenceCount.current += 1;
        const id = `node_${nodeSequenceCount.current}`;
        const compConfig = ComponentRegistry[componentType] || {};
        const compLabel = compConfig.label || componentType;
        const autoMaterial = inferAutoMaterialBinding({
          componentType,
          componentConfig: compConfig,
          nodeLabel: compLabel,
        });
        return nds.concat({
          id,
          type: "customNode",
          position,
          data: {
            label: compLabel,
            type: componentType,
            ...(autoMaterial?.sensorParams ? { sensorParams: autoMaterial.sensorParams } : {}),
            ...(autoMaterial?.materialBinding ? { materialBinding: autoMaterial.materialBinding } : {}),
            customIcon: resolveNodeIcon({
              customIcon: "",
              configIcon: compConfig.icon || "",
              type: componentType,
              label: compLabel,
            }),
          },
        });
      });
    },
    [rfInstance, setNodes]
  );

  const handleGenerateSignatures = () => {
    // Basic structure checking
    const activeScenarios = scenarios.filter(s => s.isActive);
    const payload = compileGraphToBackendJSON(nodes, edges, inputValues, activeScenarios);
    setCompiledJson(payload); setBackendResult(null); setError(null);
    const unconnected = getUnconnectedInputs(nodes, edges);
    setLeafInputs(unconnected);
    const newValues = { ...inputValues };
    unconnected.forEach(({ nodeId, inputName }) => {
      const key = makeNodeInputKey(nodeId, inputName);
      if (!(key in newValues)) {
        const auto = getAutofillValueForInput(nodeId, inputName);
        newValues[key] = auto ?? 0;
      }
    });
    setInputValues(newValues);
    setShowPanel(true);
    setShowLibraryPanel(false);
    setActiveTab("results");
    setResultsTab("inputs");
  };

  const handleLocalSolve = async () => {
    await customAlert("Local Solve", "🚀 Local CPU Access Granted.\nInitiating math processing on your hardware in a customized manner...");
    handleGenerateSignatures();
  };

  const handleSolve = async () => {
    if (!compiledJson) return;
    setLoading(true); setBackendResult(null); setError(null);

    // Convert to advanced Multi-Scenario Orchestrator payload
    const activeScenarios = scenarios.filter(s => s.isActive);
    const solvePayload = compileGraphToBackendJSON(nodes, edges, {}, activeScenarios);

    // Scope unconnected leaf input symbols to each node instance so duplicated nodes stay independent.
    const globalConstants = {};
    Object.entries(inputValues).forEach(([key, value]) => {
      if (!key.includes("::")) globalConstants[key] = value;
    });

    const solveLeafInputs = getUnconnectedInputs(nodes, edges);
    const unconnectedByNode = {};
    solveLeafInputs.forEach(({ nodeId, inputName }) => {
      if (!unconnectedByNode[nodeId]) unconnectedByNode[nodeId] = new Set();
      unconnectedByNode[nodeId].add(inputName);
      const scopedName = `${nodeId}__${inputName}`;
      const scopedKey = makeNodeInputKey(nodeId, inputName);
      globalConstants[scopedName] = inputValues[scopedKey] ?? inputValues[inputName] ?? 0;
    });

    solvePayload.nodes = solvePayload.nodes.map((node) => {
      const scopedInputs = unconnectedByNode[node.id];
      if (!scopedInputs || scopedInputs.size === 0) return node;
      const nextFormulas = {};
      Object.entries(node.formulas || {}).forEach(([outputName, formula]) => {
        let nextFormula = formula;
        scopedInputs.forEach((inputName) => {
          const scopedName = `${node.id}__${inputName}`;
          nextFormula = nextFormula.replace(
            new RegExp(`\\b${escapeRegExp(inputName)}\\b`, "g"),
            scopedName
          );
        });
        nextFormulas[outputName] = nextFormula;
      });
      return { ...node, formulas: nextFormulas };
    });

    solvePayload.global_constants = {
      ...(solvePayload.global_constants || {}),
      ...globalConstants,
    };

    // Run Pre-flight Checks
    const validationIssues = validatePayload(solvePayload);
    if (validationIssues.length > 0) {
      const isError = validationIssues.some(msg => msg.includes("empty"));
      if (isError) {
        showToast(`❌ ${validationIssues[0]}`);
        setLoading(false);
        return;
      } else {
        showToast(`VALIDATION_FAIL // ${validationIssues[0]}`);
      }
    }

    try {
      // ── Route through Local Pyodide WebWorker ──
      const worker = pyodideWorkerRef.current;
      if (!worker) throw new Error('Pyodide worker not initialized');

      const result = await new Promise((resolve, reject) => {
        solveResolverRef.current = { resolve, reject };
        worker.postMessage({ type: 'SOLVE', payload: solvePayload });
      });

      const runRecord = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        projectId: currentProjectId || null,
        projectName: currentProjectName || "Unsaved Workflow",
        nodeCount: solvePayload?.nodes?.length || 0,
        connectionCount: solvePayload?.connections?.length || 0,
        layerCount: solvePayload?.batch_metadata?.total_layers || 0,
        scenarioCount: Array.isArray(activeScenarios) ? activeScenarios.length : 0,
        sweepRunCount: getSweepRunCountFromResult(result),
        solvePayload: structuredClone(solvePayload),
        result: structuredClone(result),
        workflowSnapshot: {
          nodes: structuredClone(nodes),
          edges: structuredClone(edges),
          scenarios: structuredClone(scenarios),
        },
      };

      setExecutionRecords((prev) => {
        const next = [runRecord, ...prev].slice(0, 200);
        if (currentProjectId) {
          setSavedProjects((projects) =>
            projects.map((p) =>
              p.id === currentProjectId
                ? { ...p, executionRecords: structuredClone(next), backendResult: structuredClone(result), savedAt: new Date().toISOString() }
                : p
            )
          );
        }
        return next;
      });

      setBackendResult(result);
      setActiveTab("results");
      setResultsTab("solver");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCalculationPreview = (project, record) => {
    if (!record?.solvePayload || !record?.result) {
      showToast("TRACE record is incomplete", "error");
      return;
    }
    setSelectedCalculationByProject((prev) => ({ ...prev, [project.id]: record.id }));
    setActiveCalculationPreview({
      projectId: project.id,
      projectName: project.name,
      recordId: record.id,
      createdAt: record.createdAt,
      solvePayload: structuredClone(record.solvePayload),
      result: structuredClone(record.result),
      nodeCount: record.nodeCount || 0,
      connectionCount: record.connectionCount || 0,
      layerCount: record.layerCount || 0,
      scenarioCount: record.scenarioCount || 0,
      sweepRunCount: record.sweepRunCount || 0,
    });
  };

  const handleCloseCalculationPreview = () => setActiveCalculationPreview(null);

  const handleOpenProjectFromCalculation = async (project) => {
    const selectedId = selectedCalculationByProject[project.id];
    const selectedRecord = (project.executionRecords || []).find((record) => record.id === selectedId);
    if (!selectedRecord) {
      showToast("Select a calculation record first", "error");
      return;
    }

    const snapshot = selectedRecord.workflowSnapshot;
    const projectFromRecord = snapshot
      ? {
          ...project,
          nodes: structuredClone(snapshot.nodes || project.nodes || []),
          edges: structuredClone(snapshot.edges || project.edges || []),
          scenarios: structuredClone(snapshot.scenarios || project.scenarios || []),
          backendResult: selectedRecord.result ? structuredClone(selectedRecord.result) : project.backendResult,
        }
      : {
          ...project,
          backendResult: selectedRecord.result ? structuredClone(selectedRecord.result) : project.backendResult,
        };

    await handleLoadProject(projectFromRecord);
  };

  const handleDuplicateCalculationRecord = (project, record) => {
    const duplicated = {
      ...structuredClone(record),
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };

    setSavedProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== project.id) return p;
        const records = Array.isArray(p.executionRecords) ? p.executionRecords : [];
        return {
          ...p,
          executionRecords: [duplicated, ...records].slice(0, 200),
          savedAt: new Date().toISOString(),
        };
      });

      const updatedProject = next.find((p) => p.id === project.id);
      if (updatedProject) syncToCloud(updatedProject);
      return next;
    });

    if (currentProjectId === project.id) {
      setExecutionRecords((prev) => [duplicated, ...prev].slice(0, 200));
    }
    showToast("Calculation record duplicated", "success");
  };

  const handleDeleteCalculationRecord = async (project, record) => {
    const confirmed = await customConfirm("Delete Calculation", "Delete this calculation trace record?");
    if (!confirmed) return;

    setSavedProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== project.id) return p;
        const records = (p.executionRecords || []).filter((r) => r.id !== record.id);
        return { ...p, executionRecords: records, savedAt: new Date().toISOString() };
      });

      const updatedProject = next.find((p) => p.id === project.id);
      if (updatedProject) syncToCloud(updatedProject);
      return next;
    });

    if (currentProjectId === project.id) {
      setExecutionRecords((prev) => prev.filter((r) => r.id !== record.id));
    }

    if (activeCalculationPreview?.recordId === record.id && activeCalculationPreview?.projectId === project.id) {
      setActiveCalculationPreview(null);
    }
    setSelectedCalculationByProject((prev) => {
      if (prev[project.id] !== record.id) return prev;
      const next = { ...prev };
      delete next[project.id];
      return next;
    });

    showToast("Calculation record deleted", "success");
  };

  function getAutofillValueForInput(nodeId, inputName, nodeList = nodes) {
    const node = (nodeList || []).find((n) => n.id === nodeId);
    return resolveNodeInputAutofillValue(node, inputName);
  }

  const handleSignOut = async () => {
    setShowQuickProfileMenu(false);
    setShowPanel(false);
    setShowLibraryPanel(false);
    setInspectedNodeId(null);
    setActiveSkeletonNodeId(null);
    setActiveSection("workspace");
    onExit?.();
    try {
      sessionStorage.removeItem(WORKSPACE_ACTIVE_SESSION_KEY);
      sessionStorage.removeItem(WORKSPACE_ACTIVE_AT_KEY);
      sessionStorage.removeItem(WORKSPACE_RESUME_INTENT_AT_KEY);
    } catch {
      // Ignore sessionStorage write failures and keep in-memory state.
    }
  };

  // Auth/admin/token flows removed.

  const handleCloseWorkspace = async () => {
    const canProceed = await confirmProceedWithPotentialDataLoss("signing out");
    if (!canProceed) return;

    setShowQuickProfileMenu(false);
    setShowPanel(false);
    setShowLibraryPanel(false);
    setInspectedNodeId(null);
    setActiveSkeletonNodeId(null);
    setActiveSection("workspace");
    onExit?.();
    try {
      sessionStorage.removeItem(WORKSPACE_ACTIVE_SESSION_KEY);
      sessionStorage.removeItem(WORKSPACE_ACTIVE_AT_KEY);
      sessionStorage.removeItem(WORKSPACE_RESUME_INTENT_AT_KEY);
      sessionStorage.removeItem(WORKSPACE_OPENED_THIS_TAB_KEY);
      sessionStorage.removeItem(WORKSPACE_LAUNCH_INTENT_KEY);
    } catch {
      // Ignore sessionStorage write failures and keep in-memory state.
    }
    // Return to landing in-app without hard routing.
  };

  // Auth launch flow removed.

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 ${darkMode ? "dark-mode" : "light-mode"}`}
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── Floating Nav (position: fixed, doesn't take layout space) ── */}
      <NavBar activeSection={activeSection} onSectionChange={handleSectionChange} />

      {/* ── Workspace (Canvas Editor) ── */}
      {activeSection === "workspace" && (
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* ── Top Bar — Compact Glassmorphic ── */}
          {/* Header */}
          <header className={`h-14 border-b flex items-center justify-between pl-24 pr-6 flex-shrink-0 z-40 transition-colors duration-300`}
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-technical)',
              boxShadow: 'var(--shadow-node)'
            }}>
            <div className="flex items-center gap-6">
              <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={handleCloseWorkspace}
                title="Return to Landing Page"
              >
                <div className="w-8 h-8 rounded-sm outline outline-1 flex items-center justify-center font-bold text-lg transition-colors"
                  style={{ outlineColor: "var(--primary-glow)", color: "var(--primary-strong)", background: "var(--primary-dim)" }}
                >🔬</div>
                <div className="flex flex-col">
                  <h1 className="text-xl font-black tracking-tight flex items-baseline gap-1 m-0 text-white">
                    Tatva<span style={{ color: "var(--primary-strong)" }}>Labz</span> <span className="text-[10px] tracking-[0.2em] font-mono" style={{ color: "var(--primary-strong)" }}>CORE</span>
                  </h1>
                  <span className="text-[8px] tracking-[0.12em] uppercase" style={{ color: "#6b7fa0", fontFamily: "'JetBrains Mono', monospace" }}>
                    inspired by conciousness
                  </span>
                </div>
              </div>
              {/* Separator */}
              <div style={{ width: '1px', height: '20px', background: 'rgba(100, 160, 220, 0.12)' }} />

              {/* Project name + status */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => {
                    if (currentProjectId) {
                      handleRenameProject(currentProjectId, currentProjectName);
                    } else if (nodes.length > 0) {
                      // Unsaved workflow — prompt to save with a name
                      handleSaveProject();
                    }
                  }}
                  title={currentProjectId ? 'Click to rename' : (nodes.length > 0 ? 'Click to save & name this workflow' : '')}
                  className="truncate"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: currentProjectName ? 'var(--text-secondary)' : 'var(--text-muted)',
                    fontSize: '13px', fontWeight: 500, padding: '2px 6px',
                    borderRadius: '6px', transition: 'all 0.15s',
                    maxWidth: '220px', textOverflow: 'ellipsis', overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary-dim)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = currentProjectName ? 'var(--text-secondary)' : 'var(--text-muted)'; }}
                >
                  {currentProjectName || (nodes.length > 0 ? 'Untitled workflow' : 'No project')}
                </button>

                {/* Unsaved changes indicator */}
                {(nodes.length > 0 || edges.length > 0) && hasUnsavedChanges() && (
                  <span
                    title="Unsaved changes"
                    style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: '#fbbf24', flexShrink: 0,
                      boxShadow: '0 0 6px rgba(251, 191, 36, 0.5)',
                      animation: 'pulse 2s ease-in-out infinite',
                    }}
                  />
                )}
              </div>
            </div>

            {/* Right: Icon-only action buttons */}
            <div className="flex items-center gap-2">
              {/* Node/Edge counter */}
              <span className="text-[10px] px-2 py-1 rounded-lg hidden sm:inline-block"
                style={{
                  background: 'rgba(14, 20, 35, 0.4)',
                  border: '1px solid rgba(100, 160, 220, 0.08)',
                  color: 'var(--text-muted)',
                  fontFamily: "var(--font-mono)",
                }}>
                {nodes.length}n · {edges.length}e
              </span>

              {/* New Workflow — icon only */}
              <button onClick={handleNewWorkflow}
                title="New Workflow"
                className="action-icon-btn"
                style={{
                  ...topActionBtnBase,
                  background: 'var(--primary-dim)',
                  border: '1px solid var(--primary-glow)',
                  color: 'var(--primary-strong)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary-dim)'; e.currentTarget.style.borderColor = 'var(--primary-glow)'; }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
                NEW
              </button>

              {/* Save — icon only */}
              <button onClick={handleSaveProject}
                title="Save Project"
                className="action-icon-btn"
                style={{
                  ...topActionBtnBase,
                  background: 'var(--primary-dim)',
                  border: '1px solid var(--primary-glow)',
                  color: 'var(--primary-strong)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary-dim)'; e.currentTarget.style.borderColor = 'var(--primary-glow)'; }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V7l4-4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v4h8" /></svg>
                SAVE
              </button>

              {/* Simulate */}
              <button
                ref={simulateBtnRef}
                onClick={() => {
                  setShowPanel((v) => {
                    const next = !v;
                    if (next) setActiveTab("simulation");
                    return next;
                  });
                  setShowLibraryPanel(false);
                  setShowExportMenu(false);
                  setShowQuickProfileMenu(false);
                }}
                title="Simulate"
                className="action-icon-btn"
                style={{
                  ...topActionBtnBase,
                  background: showPanel ? 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)' : 'var(--primary-dim)',
                  border: `1px solid ${showPanel ? 'var(--primary)' : 'var(--primary-glow)'}`,
                  color: 'var(--primary-strong)',
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = showPanel ? 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)' : 'var(--primary-dim)';
                  e.currentTarget.style.borderColor = showPanel ? 'var(--primary)' : 'var(--primary-glow)';
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l10 6-10 6V6z" /></svg>
                SIMULATE
              </button>

              {/* Node Library — icon only */}
              <button
                ref={libraryBtnRef}
                onClick={() => {
                  setShowLibraryPanel((v) => !v);
                  setShowPanel(false);
                  setShowExportMenu(false);
                  setShowQuickProfileMenu(false);
                }}
                title="Node Library"
                className="action-icon-btn"
                style={{
                  ...topActionBtnBase,
                  background: showLibraryPanel ? 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)' : 'var(--primary-dim)',
                  border: `1px solid ${showLibraryPanel ? 'var(--primary)' : 'var(--primary-glow)'}`,
                  color: 'var(--primary-strong)',
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = showLibraryPanel ? 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)' : 'var(--primary-dim)';
                  e.currentTarget.style.borderColor = showLibraryPanel ? 'var(--primary)' : 'var(--primary-glow)';
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v16H4zM13 4h7v16h-7z" /></svg>
                LIBRARY
              </button>

              {/* Export Menu */}
              <div
                ref={exportMenuRef}
                style={{ position: 'relative' }}
              >
                <button
                  onClick={() => setShowExportMenu((v) => !v)}
                  disabled={isPdfExporting || isCsvExporting}
                  title="Export"
                  className="action-icon-btn"
                  style={{
                    ...topActionBtnBase,
                    background: showExportMenu ? 'color-mix(in oklab, var(--primary-dim) 78%, white 22%)' : 'var(--primary-dim)',
                    border: `1px solid ${showExportMenu ? 'var(--primary)' : 'var(--primary-glow)'}`,
                    cursor: (isPdfExporting || isCsvExporting) ? 'wait' : 'pointer', transition: 'all 0.1s ease',
                    color: (isPdfExporting || isCsvExporting) ? 'var(--text-muted)' : 'var(--primary-strong)',
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
                  {(isPdfExporting || isCsvExporting) ? 'PROCESSING…' : 'EXPORT'}
                </button>
                {showExportMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '26px',
                      right: 0,
                      minWidth: '132px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-technical)',
                      borderRadius: popupMenuRadius,
                      boxShadow: 'var(--shadow-node)',
                      overflow: 'hidden',
                      zIndex: 80,
                    }}
                  >
                    <button
                      onClick={handleExportCsv}
                      disabled={isPdfExporting || isCsvExporting}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        color: '#c5d5e8',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '8px 10px',
                        cursor: (isPdfExporting || isCsvExporting) ? 'not-allowed' : 'pointer',
                        opacity: (isPdfExporting || isCsvExporting) ? 0.5 : 1,
                        letterSpacing: '0.03em',
                      }}
                    >
                      EXPORT CSV
                    </button>
                    <button
                      onClick={handleExportPdf}
                      disabled={isPdfExporting || isCsvExporting}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'rgba(56, 189, 248, 0.08)',
                        border: 'none',
                        borderTop: '1px solid rgba(56, 189, 248, 0.18)',
                        color: '#93c5fd',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '8px 10px',
                        cursor: (isPdfExporting || isCsvExporting) ? 'not-allowed' : 'pointer',
                        opacity: (isPdfExporting || isCsvExporting) ? 0.5 : 1,
                        letterSpacing: '0.03em',
                      }}
                    >
                      EXPORT PDF
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Profile Menu */}
              <div
                ref={quickProfileRef}
                style={{ position: 'relative' }}
              >
                <button
                  onClick={() => setShowQuickProfileMenu((v) => !v)}
                  title="Profile"
                  className="action-icon-btn"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: showQuickProfileMenu ? 'rgba(103, 232, 249, 0.16)' : 'rgba(100, 160, 220, 0.08)',
                    border: `1px solid ${showQuickProfileMenu ? 'rgba(103, 232, 249, 0.55)' : 'rgba(100, 160, 220, 0.28)'}`,
                    color: '#c5d5e8',
                    fontSize: '11px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  U
                </button>

                {showQuickProfileMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '26px',
                      right: 0,
                      minWidth: '124px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-technical)',
                      borderRadius: popupMenuRadius,
                      boxShadow: 'var(--shadow-node)',
                      overflow: 'hidden',
                      zIndex: 80,
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowQuickProfileMenu(false);
                        setActiveSection("profile");
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        color: '#c5d5e8',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        letterSpacing: '0.03em',
                      }}
                    >
                      PROFILE
                    </button>
                    <button
                      onClick={() => {
                        setShowQuickProfileMenu(false);
                        handleSignOut();
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: 'none',
                        borderTop: '1px solid rgba(239, 68, 68, 0.18)',
                        color: '#fca5a5',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        letterSpacing: '0.03em',
                      }}
                    >
                      SIGN OUT
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* ── Canvas + Panels ── */}
          <div className="flex flex-1 min-h-0 relative">
            {/* React Flow Canvas */}
            <div ref={reactFlowWrapper} className="flex-1 min-w-0 relative"
              style={{ background: 'var(--canvas-bg)' }}>
              <ReactFlow
                nodes={nodes} edges={edges}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                onConnect={onConnect} onInit={setRfInstance}
                onDrop={onDrop} onDragOver={onDragOver}
                nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: "deletable" }}
                isValidConnection={isValidConnection}
                defaultViewport={WORKSPACE_DEFAULT_VIEWPORT}
                minZoom={WORKSPACE_MIN_ZOOM}
                maxZoom={WORKSPACE_MAX_ZOOM}
                fitViewOptions={{ minZoom: 0.82, maxZoom: 1.08, padding: 0.14 }}
                fitView deleteKeyCode="Delete"
                className="bg-transparent"
                onNodeDoubleClick={(e, node) => setInspectedNodeId(node.id)}
                onPaneClick={() => setInspectedNodeId(null)}
              >
                <Controls />
                {showMiniMap && (
                  <MiniMap
                    nodeColor={(n) => (n.data.type === "motor" ? "#22d3ee" : "#f97316")}
                  />
                )}
                <Background variant={BackgroundVariant.Dots} gap={20} size={0.8} color="rgba(100, 160, 220, 0.06)" />
              </ReactFlow>

              {/* Empty state */}
              {nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center" style={{ opacity: 0.6 }}>
                    <p className="text-[12px] font-bold tracking-[0.3em] mb-4" style={{ color: 'var(--primary)', opacity: 0.8 }}>NULL_STATE // NO_CORE_NODES</p>
                    <p className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                      Drag nodes from Node Library and start building
                    </p>
                  </div>
                </div>
              )}

              {/* Connection toast */}
              {connectionToast && (
                <div
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: 'var(--bg-card)',
                    border: `1px solid ${connectionToast.type === "error"
                      ? 'var(--status-err)' : connectionToast.type === "success"
                        ? 'var(--status-ok)' : 'var(--status-warn)'}`,
                    borderRadius: '2px',
                    color: connectionToast.type === "error" ? 'var(--status-err)' : connectionToast.type === "success" ? 'var(--status-ok)' : 'var(--status-warn)',
                    boxShadow: 'var(--shadow-node)',
                  }}
                >
                  {connectionToast.message}
                </div>
              )}

              {/* Node Inspector Bottom Panel */}
              {inspectedNodeId && (
                <NodeInspectorPanel
                  nodeId={inspectedNodeId}
                  onClose={() => setInspectedNodeId(null)}
                  activeScenarioId={activeScenarioId}
                  setScenarios={setScenarios}
                  scenarios={scenarios}
                />
              )}
            </div>

            {/* ── Node Library Panel (Standalone) ── */}
            {showLibraryPanel && (
              <div className="w-[clamp(220px,20vw,280px)] flex flex-col shrink-0 overflow-hidden min-h-0"
                ref={libraryPanelRef}
                style={{
                  ...glassStyle,
                  borderLeft: '1px solid var(--border-subtle)',
                  borderTopLeftRadius: sidePanelRadius,
                  borderBottomLeftRadius: sidePanelRadius,
                  boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
                }}>
                <div className="flex items-center justify-between px-4 py-3.5 shrink-0"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>PROJECT // NODE_LIBRARY</h2>
                  <button onClick={() => setShowLibraryPanel(false)}
                    style={{
                      color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1,
                      background: 'none', border: 'none', cursor: 'pointer',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <Sidebar customComponents={customComponents} />
                </div>
              </div>
            )}

            {/* ── Simulate Panel: Simulation | Results ── */}
            {showPanel && (
              <div className="w-[clamp(300px,30vw,420px)] flex flex-col shrink-0 overflow-hidden min-h-0"
                ref={simulatePanelRef}
                style={{
                  ...glassStyle,
                  borderLeft: '1px solid var(--border-subtle)',
                  borderTopLeftRadius: sidePanelRadius,
                  borderBottomLeftRadius: sidePanelRadius,
                  boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
                }}>
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-3.5 shrink-0"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    {activeTab === "simulation" ? "SIMULATION // ORCHESTRATOR" : "DATA // COMPUTE_RESULTS"}
                  </h2>
                  <button onClick={() => setShowPanel(false)}
                    style={{ color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >×</button>
                </div>

                {/* Tabs */}
                <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {[
                    { key: "simulation", label: "SIMULATION", color: "var(--primary-strong)", count: scenarios.length },
                    { key: "results", label: "RESULTS", color: "#22d3ee" },
                  ].map((tab) => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className="flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors"
                      style={{
                        color: activeTab === tab.key ? tab.color : 'var(--text-muted)',
                        borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                        background: activeTab === tab.key ? 'rgba(255,255,255,0.02)' : 'transparent',
                      }}
                    >
                      {tab.label}
                      {tab.count > 0 && (
                        <span style={{
                          marginLeft: '4px', fontSize: '9px',
                          background: `${tab.color}18`, color: tab.color,
                          padding: '1px 6px', borderRadius: '10px',
                        }}>
                          {tab.count}
                        </span>
                      )}
                      {tab.key === "solver" && loading && <span className="ml-1 animate-pulse">●</span>}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {activeTab === "simulation" && (
                    <div className="h-full overflow-hidden relative">
                      <div className="h-full flex flex-col min-h-0">
                        <div className="flex-1 min-h-0">
                          <ScenarioManager
                            embedded
                            scenarios={scenarios}
                            setScenarios={setScenarios}
                            activeScenarioId={activeScenarioId}
                            setActiveScenarioId={setActiveScenarioId}
                            onClose={() => setActiveTab("results")}
                            onBuild={handleGenerateSignatures}
                            onRun={handleSolve}
                            onRunAll={handleSolve}
                            onOpenResults={() => {
                              setActiveTab("results");
                              setResultsTab("solver");
                            }}
                            onSaveExperiment={handleSaveProject}
                            isRunning={loading}
                            hasCompiledGraph={Boolean(compiledJson)}
                            lastRunRecord={executionRecords[0] || null}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "results" && (
                    <>
                      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {[
                          { key: "inputs", label: "INPUTS", color: "#f97316", count: leafInputs.length },
                          { key: "compiled", label: "TRACE", color: "#22d3ee" },
                          { key: "solver", label: "OUTPUT", color: "#10b981" },
                        ].map((tab) => (
                          <button key={tab.key} onClick={() => setResultsTab(tab.key)}
                            className="flex-1 px-3 py-2 text-[10px] font-semibold transition-colors"
                            style={{
                              color: resultsTab === tab.key ? tab.color : 'var(--text-muted)',
                              borderBottom: resultsTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                              background: resultsTab === tab.key ? 'rgba(255,255,255,0.02)' : 'transparent',
                            }}
                          >
                            {tab.label}
                            {tab.count > 0 && (
                              <span style={{
                                marginLeft: '4px', fontSize: '9px',
                                background: `${tab.color}18`, color: tab.color,
                                padding: '1px 6px', borderRadius: '10px',
                              }}>
                                {tab.count}
                              </span>
                            )}
                            {tab.key === "solver" && loading && <span className="ml-1 animate-pulse">●</span>}
                          </button>
                        ))}
                      </div>

                      {/* ── Inputs Sub-Tab ── */}
                      {resultsTab === "inputs" && (
                    <div className="h-full overflow-y-auto p-4">
                      {leafInputs.length === 0 ? (
                        <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                          All inputs are already connected in this workflow. You can run solve directly.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-[11px] ui-body">
                            Layer 1 Inputs // Set values for unconnected leaf inputs.
                          </p>

                          {Object.entries(
                            leafInputs.reduce((acc, item) => {
                              if (!acc[item.nodeId]) acc[item.nodeId] = { nodeLabel: item.nodeLabel, inputs: [] };
                              acc[item.nodeId].inputs.push(item);
                              return acc;
                            }, {})
                          ).map(([nodeId, group]) => (
                            <div key={nodeId} className="rounded-xl overflow-hidden"
                              style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                              }}>
                              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <span className="text-[10px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>
                                  LAYER 1 // {group.nodeLabel}
                                </span>
                              </div>
                              <div className="p-3 space-y-2">
                                {group.inputs.map(({ inputName }) => (
                                  <div key={`${nodeId}_${inputName}`} className="flex items-center gap-2">
                                    <label className="text-[11px] w-28 shrink-0 truncate" title={inputName}
                                      style={{ color: 'var(--primary-strong)', fontFamily: "var(--font-mono)" }}>
                                      {inputName}
                                    </label>
                                    <input
                                      type="number" step="any"
                                      value={
                                        inputValues[makeNodeInputKey(nodeId, inputName)] ??
                                        inputValues[inputName] ??
                                        getAutofillValueForInput(nodeId, inputName) ??
                                        0
                                      }
                                      onChange={(e) =>
                                        setInputValues((prev) => ({
                                          ...prev,
                                          [makeNodeInputKey(nodeId, inputName)]: parseFloat(e.target.value) || 0,
                                        }))
                                      }
                                      style={{
                                        flex: 1,
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '8px',
                                        padding: '5px 8px',
                                        fontSize: '12px',
                                        color: 'var(--text-primary)',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        minWidth: 0,
                                      }}
                                      onFocus={(e) => e.target.style.borderColor = 'var(--border-ring)'}
                                      onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}

                          <button
                            className="topbar-btn"
                            onClick={handleSaveProject}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              opacity: 1,
                              cursor: 'pointer'
                            }}
                          >
                            <span>{currentProjectId ? 'SAVE NOW' : 'SAVE AS'}</span>
                          </button>
                          {/* Solve button */}
                          <button onClick={handleSolve} disabled={loading}
                            className="w-full active:scale-95 transition-transform"
                            style={{
                              padding: '10px 16px',
                              background: loading ? 'var(--bg-elevated)' : 'rgba(16, 185, 129, 0.1)',
                              color: loading ? 'var(--text-muted)' : '#6ee7b7',
                              borderColor: loading ? 'var(--border-subtle)' : 'rgba(16, 185, 129, 0.25)',
                              boxShadow: loading ? 'none' : '0 0 16px rgba(16, 185, 129, 0.08)',
                              cursor: loading ? 'wait' : 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {loading ? (<><span className="text-[10px] opacity-50 font-mono">BUSY //</span> Processing…</>) : (<><span className="text-[10px] opacity-50 font-mono">SOLVE //</span> Run Simulation</>)}
                          </button>
                        </div>
                      )}
                    </div>
                      )}

                      {/* ── Trace Sub-Tab ── */}
                      {resultsTab === "compiled" && compiledJson && (
                    <div className="h-full overflow-y-auto">
                      <ExecutionTrace compiledJson={compiledJson} backendResult={backendResult} />
                    </div>
                      )}

                      {/* ── Output Sub-Tab ── */}
                      {resultsTab === "solver" && (
                    <div className="h-full overflow-y-auto p-4">
                      {error && !loading && (
                        <div className="p-3 text-xs rounded-xl"
                          style={{
                            background: 'rgba(127, 29, 29, 0.3)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#fecaca',
                          }}>
                          <p className="font-bold mb-1">❌ Backend Error</p>
                          <p>{error}</p>
                        </div>
                      )}

                      {backendResult && !loading && (
                        <ResultsDashboard result={backendResult} compiledJson={compiledJson} />
                      )}

                      {!backendResult && !loading && !error && (
                        <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                          Click "Process" to solve the graph
                        </p>
                      )}
                    </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === "skeleton_editor" && activeSkeletonNodeId && (
        <div className="flex-1 min-w-0" style={{ height: "100vh" }}>
          <SkeletonEditor
            targetNode={nodes.find(n => n.id === activeSkeletonNodeId)}
            onBack={() => {
              setActiveSection("workspace");
              setActiveSkeletonNodeId(null);
            }}
            onSave={(internalGraphData) => {
              setNodes(nds => nds.map(n => {
                if (n.id === activeSkeletonNodeId) {
                  // Extract inputs and outputs from the internal network
                  const extractedInputs = internalGraphData.nodes
                    .filter(node => node.type === "terminal" && node.data.type === "input")
                    .map(node => node.data.label);

                  const extractedOutputs = internalGraphData.nodes
                    .filter(node => node.type === "terminal" && node.data.type === "output")
                    .map(node => node.data.label);

                  // Mathematically compile the visual connection graph into flat formulas
                  const extractedFormulas = compileSkeletonToFormulas(
                    internalGraphData.nodes,
                    internalGraphData.edges || []
                  );

                  return {
                    ...n,
                    data: {
                      ...n.data,
                      internalGraph: internalGraphData,
                      customInputs: extractedInputs,
                      customOutputs: extractedOutputs,
                      customFormulas: extractedFormulas
                    }
                  };
                }
                return n;
              }));
              showToast("Internal physics skeleton mathematically compiled and saved!", "success");
              setActiveSection("workspace");
              setActiveSkeletonNodeId(null);
            }}
          />
        </div>
      )}

      {/* ── ALL OTHER SECTIONS ── */}
      {activeSection !== "workspace" && activeSection !== "skeleton_editor" && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden"
          style={{
            background: 'var(--panel-bg)',
            position: 'relative', zIndex: 10,
          }}
        >
          {/* Section Header */}
          <header className="flex items-center justify-between px-8 py-3 shrink-0" style={glassHeaderStyle}>
            <div className="flex items-center gap-3" style={{ paddingLeft: '92px' }}>
              <button onClick={() => setActiveSection("workspace")}
                style={{ color: '#6b7fa0', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                title="Back to Workspace"
                onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7fa0'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <h1 className="text-lg font-bold capitalize" style={{ color: '#e2e8f0' }}>
                {activeSection === "saved" ? "Saved Projects" :
                  activeSection === "saved_calculations" ? "Saved Calculations" :
                  activeSection === "external_devices" ? "External Devices" :
                  activeSection === "help" ? "Help & Documentation" : activeSection}
              </h1>
            </div>
          </header>

          {/* Section Content */}
          <div className="flex-1 overflow-auto">
            {activeSection === "saved" && (
              <div className="max-w-4xl mx-auto p-8">
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm" style={{ color: '#6b7fa0' }}>Your saved digital twin projects ({savedProjects.length})</p>
                  <button onClick={() => setActiveSection("workspace")}
                    style={{
                      ...glassButtonBase,
                      background: 'rgba(34, 211, 238, 0.1)',
                      color: '#67e8f9',
                      borderColor: 'rgba(34, 211, 238, 0.25)',
                    }}
                  >
                    <span>+</span> New Project
                  </button>
                </div>

                {/* Search bar */}
                {savedProjects.length > 0 && (
                  <div className="mb-5 relative">
                    <div style={{
                      position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)',
                      color: '#4a5568', fontSize: '14px', pointerEvents: 'none',
                    }}>🔍</div>
                    <input
                      type="text"
                      placeholder="Search by name, description, or tags…"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      style={{
                        width: '100%', background: 'var(--bg-surface)',
                        border: '1px solid var(--border-technical)', borderRadius: '2px',
                        padding: '8px 36px', fontSize: '11px', color: 'var(--text-secondary)',
                        outline: 'none', transition: 'border-color 0.2s',
                        fontFamily: "'JetBrains Mono', monospace"
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(34, 211, 238, 0.3)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(100, 160, 220, 0.1)'}
                    />
                    {projectSearch && (
                      <button
                        onClick={() => setProjectSearch('')}
                        style={{
                          position: 'absolute', top: '50%', right: '12px', transform: 'translateY(-50%)',
                          background: 'rgba(100, 160, 220, 0.1)', border: 'none', borderRadius: '50%',
                          width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#6b7fa0', fontSize: '11px', cursor: 'pointer', lineHeight: 1,
                        }}
                      >✕</button>
                    )}
                  </div>
                )}

                {(() => {
                  const q = projectSearch.toLowerCase().trim();
                  const filteredProjects = q
                    ? savedProjects.filter(p =>
                      (p.name || '').toLowerCase().includes(q) ||
                      (p.description || '').toLowerCase().includes(q) ||
                      (p.tags || []).some(t => t.toLowerCase().includes(q))
                    )
                    : savedProjects;

                  if (savedProjects.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-20 text-center" style={{ opacity: 0.5 }}>
                      <span className="text-4xl mb-3">📂</span>
                      <p className="font-medium mb-1" style={{ color: '#8899b0' }}>No saved projects yet</p>
                      <p className="text-xs" style={{ color: '#4a5568' }}>Go to Workspace, build a circuit, and click "💾 Save" to save it here.</p>
                    </div>
                  );

                  if (filteredProjects.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-16 text-center" style={{ opacity: 0.6 }}>
                      <span className="text-3xl mb-2">🔍</span>
                      <p className="font-medium mb-1" style={{ color: '#8899b0' }}>No projects match "{projectSearch}"</p>
                      <p className="text-xs" style={{ color: '#4a5568' }}>Try a different search term or clear the filter.</p>
                    </div>
                  );

                  return (
                    <>
                      {q && (
                        <p className="text-[11px] mb-3" style={{ color: '#4a5568' }}>
                          Showing {filteredProjects.length} of {savedProjects.length} projects
                        </p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredProjects.map((project) => {
                          const timeAgo = (() => {
                            const diff = Date.now() - new Date(project.savedAt).getTime();
                            const mins = Math.floor(diff / 60000);
                            if (mins < 1) return "just now";
                            if (mins < 60) return `${mins}m ago`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}h ago`;
                            const days = Math.floor(hrs / 24);
                            return `${days}d ago`;
                          })();

                          const isActive = currentProjectId === project.id;

                          return (
                            <div key={project.id}
                              className="p-4 transition-all flex flex-col"
                              style={{
                                background: isActive ? 'var(--primary-dim)' : 'var(--bg-card)',
                                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-technical)'}`,
                                borderRadius: '2px',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.boxShadow = 'var(--shadow-node)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = isActive ? 'var(--primary)' : 'var(--border-technical)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              {/* Title row */}
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="text-[11px] font-bold truncate uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>{project.name}</h3>
                                    {isActive && (
                                      <span style={{ fontSize: '7px', padding: '1px 4px', borderRadius: '1px', background: 'var(--primary-dim)', color: 'var(--primary)', border: '1px solid var(--primary-glow)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>ACTIVE</span>
                                    )}
                                  </div>
                                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Updated {timeAgo}</p>
                                </div>
                                {/* Edit (rename) icon */}
                                <button
                                  onClick={() => handleRenameProject(project.id, project.name)}
                                  title="Rename project"
                                  className="opacity-40 hover:opacity-100 transition-opacity"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: '2px', fontWeight: 'bold' }}
                                >EDIT</button>
                              </div>

                              {/* Description */}
                              <div className="mb-3 min-h-[28px]">
                                <textarea
                                  placeholder="Add metadata..."
                                  value={project.description || ''}
                                  onChange={(e) => handleUpdateProjectMeta(project.id, 'description', e.target.value)}
                                  rows={2}
                                  style={{
                                    width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-technical)',
                                    borderRadius: '1px', padding: '4px 6px', fontSize: '9px', color: 'var(--text-secondary)',
                                    outline: 'none', resize: 'none', transition: 'border-color 0.2s',
                                    fontFamily: "'JetBrains Mono', monospace",
                                  }}
                                />
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2 mt-auto">
                                <button onClick={() => handleLoadProject(project)}
                                  className="flex-1 active:scale-95 transition-transform"
                                  style={{
                                    ...glassButtonBase, justifyContent: 'center', fontSize: '10px',
                                    background: 'var(--primary)', color: '#fff',
                                    borderColor: 'var(--primary-glow)',
                                    height: '28px'
                                  }}>OPEN_WORK</button>
                                <button onClick={() => handleDuplicateProject(project)}
                                  title="Duplicate project"
                                  className="active:scale-95 transition-transform"
                                  style={{
                                    ...glassButtonBase, fontSize: '10px',
                                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                                    borderColor: 'var(--border-technical)', width: '32px', padding: '0', justifyContent: 'center'
                                  }}>CPY</button>
                                <button onClick={() => handleDeleteProject(project.id, project.name)}
                                  title="Delete project"
                                  className="active:scale-95 transition-transform"
                                  style={{
                                    ...glassButtonBase, fontSize: '10px',
                                    background: 'var(--bg-elevated)', color: 'var(--status-err)',
                                    borderColor: 'var(--border-technical)', width: '32px', padding: '0', justifyContent: 'center'
                                  }}>DEL</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {activeSection === "saved_calculations" && (
              <div className="max-w-7xl mx-auto p-8">
                {(() => {
                  const projectsWithRecords = savedProjects
                    .map((project) => ({
                      ...project,
                      executionRecords: Array.isArray(project.executionRecords) ? project.executionRecords : [],
                    }))
                    .filter((project) => project.executionRecords.length > 0)
                    .sort((a, b) => {
                      const aTime = a.executionRecords[0]?.createdAt ? new Date(a.executionRecords[0].createdAt).getTime() : 0;
                      const bTime = b.executionRecords[0]?.createdAt ? new Date(b.executionRecords[0].createdAt).getTime() : 0;
                      return bTime - aTime;
                    });

                  if (projectsWithRecords.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20 text-center" style={{ opacity: 0.6 }}>
                        <span className="text-4xl mb-3">🧾</span>
                        <p className="font-medium mb-1" style={{ color: '#8899b0' }}>No saved calculation records yet</p>
                        <p className="text-xs" style={{ color: '#4a5568' }}>Run calculations in workspace, then save/open a project to keep an execution ledger.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {projectsWithRecords.map((project) => {
                        const selectedRecordId = selectedCalculationByProject[project.id] || null;
                        return (
                        <div key={project.id} className="p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-technical)', borderRadius: '2px' }}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h3 className="text-sm font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>{project.name}</h3>
                              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                {project.executionRecords.length} record(s)
                              </p>
                            </div>
                            <button
                              onClick={() => handleOpenProjectFromCalculation(project)}
                              disabled={!selectedRecordId}
                              style={{
                                ...glassButtonBase,
                                justifyContent: 'center',
                                fontSize: '10px',
                                background: selectedRecordId ? 'rgba(34, 211, 238, 0.08)' : 'var(--bg-elevated)',
                                color: selectedRecordId ? '#67e8f9' : 'var(--text-muted)',
                                borderColor: selectedRecordId ? 'rgba(34, 211, 238, 0.25)' : 'var(--border-technical)',
                                height: '28px',
                                opacity: selectedRecordId ? 1 : 0.55,
                                cursor: selectedRecordId ? 'pointer' : 'not-allowed',
                              }}
                            >
                              OPEN PROJECT
                            </button>
                          </div>

                          <div className="space-y-2">
                            {project.executionRecords.map((record) => {
                              const isSelected = selectedRecordId === record.id;
                              return (
                              <div key={record.id} className="p-3 flex items-center justify-between gap-3"
                                onClick={() => setSelectedCalculationByProject((prev) => ({ ...prev, [project.id]: record.id }))}
                                style={{
                                  background: isSelected ? 'rgba(34, 211, 238, 0.08)' : 'var(--bg-surface)',
                                  border: `1px solid ${isSelected ? 'rgba(34, 211, 238, 0.25)' : 'var(--border-technical)'}`,
                                  borderRadius: '2px',
                                  cursor: 'pointer'
                                }}>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold uppercase tracking-tight mb-1" style={{ color: '#c5d5e8' }}>
                                    {new Date(record.createdAt).toLocaleString()}
                                  </p>
                                  <p className="text-[10px]" style={{ color: '#6b7fa0' }}>
                                    Nodes: {record.nodeCount || 0} | Connections: {record.connectionCount || 0} | Layers: {record.layerCount || 0}
                                  </p>
                                  <p className="text-[10px]" style={{ color: '#6b7fa0' }}>
                                    Scenarios: {record.scenarioCount || 0} | Sweep Runs: {record.sweepRunCount || 0}
                                  </p>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenCalculationPreview(project, record);
                                    }}
                                    style={{
                                      ...glassButtonBase,
                                      justifyContent: 'center',
                                      fontSize: '10px',
                                      background: 'var(--primary)',
                                      color: '#fff',
                                      borderColor: 'var(--primary-glow)',
                                      height: '26px',
                                    }}
                                  >
                                    VIEW TRACE
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDuplicateCalculationRecord(project, record);
                                    }}
                                    title="Duplicate record"
                                    style={{
                                      ...glassButtonBase, fontSize: '10px',
                                      background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                                      borderColor: 'var(--border-technical)', width: '32px', padding: '0', justifyContent: 'center',
                                      height: '26px',
                                    }}
                                  >
                                    CPY
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCalculationRecord(project, record);
                                    }}
                                    title="Delete record"
                                    style={{
                                      ...glassButtonBase, fontSize: '10px',
                                      background: 'var(--bg-elevated)', color: 'var(--status-err)',
                                      borderColor: 'var(--border-technical)', width: '32px', padding: '0', justifyContent: 'center',
                                      height: '26px',
                                    }}
                                  >
                                    DEL
                                  </button>
                                </div>
                              </div>
                            );
                            })}
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {activeSection === "saved_calculations" && activeCalculationPreview && (
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                style={{ background: "rgba(2, 6, 23, 0.76)", backdropFilter: "blur(2px)" }}
                onClick={handleCloseCalculationPreview}
              >
                <div
                  className="w-full h-full max-w-[1300px] max-h-[88vh] rounded-sm border flex flex-col overflow-hidden"
                  style={{ background: "var(--bg-base)", borderColor: "var(--border-technical)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="relative px-4 py-3 border-b flex items-center justify-between shrink-0"
                    style={{ borderColor: "var(--border-technical)", background: "var(--bg-card)" }}
                  >
                    <div style={{ minWidth: "120px" }} />
                    <div className="absolute left-1/2 -translate-x-1/2 text-center">
                      <h3 className="text-sm font-bold uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
                        CALCULATION TRACE
                      </h3>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#6b7fa0" }}>
                        {activeCalculationPreview.projectName} • {new Date(activeCalculationPreview.createdAt).toLocaleString()}
                      </p>
                      <p className="text-[10px]" style={{ color: "#6b7fa0" }}>
                        Nodes: {activeCalculationPreview.nodeCount} | Connections: {activeCalculationPreview.connectionCount} | Layers: {activeCalculationPreview.layerCount} | Scenarios: {activeCalculationPreview.scenarioCount} | Sweep Runs: {activeCalculationPreview.sweepRunCount}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
                      <button
                        onClick={handleCloseCalculationPreview}
                        style={{
                          ...glassButtonBase,
                          justifyContent: "center",
                          fontSize: "10px",
                          background: "var(--bg-elevated)",
                          color: "var(--text-muted)",
                          borderColor: "var(--border-technical)",
                          height: "28px",
                        }}
                      >
                        CLOSE
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    <ExecutionTrace
                      compiledJson={activeCalculationPreview.solvePayload}
                      backendResult={activeCalculationPreview.result}
                      layout="grid"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "templates" && (
              <div className="max-w-6xl mx-auto p-8 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>Pre-built Templates</h2>
                    <p className="text-sm" style={{ color: '#6b7fa0' }}>A rising complexity gallery of workflows with visual previews and skeleton details.</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.4em]" style={{ color: '#4a5568' }}>Sorted by complexity</span>
                </div>
                <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
                  <div className="space-y-3">
                    {sortedTemplates.map((template) => {
                      const isActive = selectedTemplateId === template.id;
                      return (
                        <div
                          key={template.id}
                          className="transition-all cursor-pointer select-none"
                          onClick={() => setSelectedTemplateId(template.id)}
                          onDoubleClick={() => setSelectedTemplateId(template.id)}
                          style={{
                            border: '1px solid',
                            borderColor: isActive ? 'rgba(59, 130, 246, 0.9)' : 'rgba(100, 160, 220, 0.15)',
                            borderRadius: '4px',
                            padding: '12px 14px',
                            background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)',
                            boxShadow: isActive ? '0 0 20px rgba(59, 130, 246, 0.2)' : 'none',
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{template.icon}</span>
                              <div>
                                <p className="font-semibold text-sm text-white">{template.name}</p>
                                <p className="text-[11px] text-[#aabbcc] mb-1">{template.desc}</p>
                              </div>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: '#fbbf24' }}>Lvl {template.complexity}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-2">
                            <span style={{ color: '#c5d5e8' }}>{template.nodes.length} nodes</span>
                            <span style={{ color: '#c5d5e8' }}>{template.edges.length} edges</span>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLoadTemplate(template);
                              }}
                              className="px-3 py-1 text-[11px] uppercase tracking-[0.2em] rounded-sm"
                              style={{
                                background: 'rgba(167, 139, 250, 0.1)',
                                border: '1px solid rgba(167, 139, 250, 0.4)',
                                color: '#c4b5fd',
                              }}
                            >
                              Open in Canvas
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    {(() => {
                      const template = sortedTemplates.find((t) => t.id === selectedTemplateId) || sortedTemplates[0];
                      if (!template) {
                        return (
                          <div className="rounded-sm border border-dotted border-white/20 p-6 text-center text-sm text-[#8899b0]">
                            Select a template to inspect its skeleton and formulas.
                          </div>
                        );
                      }
                      const selectedTemplate = template;
                      return (
                        <div className="space-y-4">
                          <div className="rounded-sm border border-white/10 bg-[rgba(5,11,19,0.9)] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">{selectedTemplate.icon}</span>
                                  <div>
                                    <p className="text-lg font-bold text-white">{selectedTemplate.name}</p>
                                    <p className="text-[11px] text-[#6b7fa0]">{selectedTemplate.desc}</p>
                                  </div>
                                </div>
                                <span className="text-[10px] uppercase tracking-[0.35em]" style={{ color: '#94a3b8' }}>
                                  Complexity {selectedTemplate.complexity}
                                </span>
                              </div>
                              <button
                                onClick={() => handleLoadTemplate(selectedTemplate)}
                                className="px-3 py-1 text-[11px] uppercase tracking-[0.2em] rounded-sm"
                                style={{
                                  background: 'rgba(34, 211, 238, 0.1)',
                                  border: '1px solid rgba(34, 211, 238, 0.4)',
                                  color: '#67e8f9',
                                }}
                              >
                                Open in Canvas
                              </button>
                            </div>
                          </div>
                          <div className="space-y-3">
                            {selectedTemplate.nodes.map((node) => {
                              const config = ComponentRegistry[node.type] || {};
                              const formulaSource = node.type === "custom_formula"
                                ? node.data.customFormulas || {}
                                : config.formulas || {};
                              const inputs = node.type === "custom_formula"
                                ? (node.data.customInputs || [])
                                : (config.inputs || []);
                              const outputs = node.type === "custom_formula"
                                ? (node.data.customOutputs || [])
                                : (config.outputs || []);
                              const label = node.data?.label || config.label || node.type;
                              const icon = config.icon || (node.type === "custom_formula" ? "∑" : "◉");
                              return (
                                <div key={node.id} className="border border-white/5 rounded-sm bg-[rgba(5,11,19,0.8)] p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">{icon}</span>
                                      <div>
                                        <p className="font-semibold text-sm text-white">{label}</p>
                                        <p className="text-[10px] text-[#6b7fa0]">
                                          {node.type.replace(/_/g, " ").toUpperCase()}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-[#a1b2c3]">
                                      ID: {node.id}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[#94a3b8]">
                                    Inputs: {inputs.length > 0 ? inputs.join(", ") : "—"} · Outputs: {outputs.length > 0 ? outputs.join(", ") : "—"}
                                  </div>
                                  <div className="mt-3 space-y-1 text-[11px]">
                                    {Object.entries(formulaSource).length > 0 ? (
                                      Object.entries(formulaSource).map(([name, formula]) => (
                                        <p key={`${node.id}-${name}`} className="text-[#c4b5fd]">
                                          <span className="text-[#fef3c7]">{name}</span>
                                          <span className="text-[#d8b4fe]"> = </span>
                                          <span className="text-[#94a3b8]">{formula}</span>
                                        </p>
                                      ))
                                    ) : (
                                      <p className="text-[#4ade80] text-[10px]">No explicit formula defined.</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {activeSection === "external_devices" && (
              <div className="max-w-4xl mx-auto p-8">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: "#e2e8f0" }}>External Devices</h2>
                    <p className="text-xs" style={{ color: "#8fb4de" }}>
                      Reads the local agent at `127.0.0.1:8787`. This must run on the same machine as your browser.
                    </p>
                  </div>
                  <button
                    onClick={fetchExternalDevices}
                    className="px-3 py-1 text-[11px] uppercase tracking-[0.2em] rounded-sm"
                    style={{
                      background: 'rgba(34, 211, 238, 0.1)',
                      border: '1px solid rgba(34, 211, 238, 0.4)',
                      color: '#67e8f9',
                    }}
                  >
                    Refresh
                  </button>
                </div>

                <div className="p-4 rounded-sm mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-technical)" }}>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "#8fb4de" }}>
                        Local Agent
                      </div>
                      <div className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                        Download and run the TatvaLabz Agent
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>
                        Install on the same device running this browser to list USB/Serial/LAN ports.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href="/agent-downloads/tatvalabz-agent-macos.dmg"
                        className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] rounded-sm"
                        style={{ background: "rgba(34, 211, 238, 0.1)", border: "1px solid rgba(34, 211, 238, 0.4)", color: "#67e8f9" }}
                      >
                        macOS
                      </a>
                      <a
                        href="/agent-downloads/tatvalabz-agent-windows.exe"
                        className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] rounded-sm"
                        style={{ background: "rgba(34, 211, 238, 0.1)", border: "1px solid rgba(34, 211, 238, 0.4)", color: "#67e8f9" }}
                      >
                        Windows
                      </a>
                      <a
                        href="/agent-downloads/tatvalabz-agent-linux.AppImage"
                        className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] rounded-sm"
                        style={{ background: "rgba(34, 211, 238, 0.1)", border: "1px solid rgba(34, 211, 238, 0.4)", color: "#67e8f9" }}
                      >
                        Linux
                      </a>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-sm mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-technical)" }}>
                  <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "#8fb4de" }}>
                    Agent URL
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>
                    Use a public HTTPS URL if you are on the hosted webapp. Localhost will only work when the webapp runs on the same machine.
                  </p>
                  <div className="mt-3 flex flex-col md:flex-row gap-2">
                    <input
                      value={agentUrl}
                      onChange={(e) => setAgentUrl(e.target.value)}
                      placeholder="http://127.0.0.1:8787"
                      className="flex-1 px-3 py-2 rounded-sm text-[11px]"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-technical)",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => {
                        try {
                          localStorage.setItem("tatvalabz_agent_url", agentUrl);
                        } catch {
                          // Ignore localStorage failures.
                        }
                        fetchExternalDevices();
                      }}
                      className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] rounded-sm"
                      style={{ background: "rgba(34, 211, 238, 0.12)", border: "1px solid rgba(34, 211, 238, 0.4)", color: "#67e8f9" }}
                    >
                      Save & Refresh
                    </button>
                  </div>
                  {typeof window !== "undefined" && window.location?.protocol === "https:" && agentUrl?.startsWith("http://") && (
                    <div className="mt-2 text-[10px]" style={{ color: "#f59e0b" }}>
                      Hosted pages block HTTP agent URLs. Use HTTPS (for example a tunnel) for remote access.
                    </div>
                  )}
                </div>

                {devicesLoading && (
                  <div className="p-4 rounded-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-technical)" }}>
                    <p className="text-xs" style={{ color: "#93c5fd" }}>Scanning local ports...</p>
                  </div>
                )}

                {devicesError && !devicesLoading && (
                  <div className="p-4 rounded-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <p className="text-xs" style={{ color: "#fca5a5" }}>
                      Agent not reachable. Start the local agent and refresh.
                    </p>
                    <p className="text-[11px]" style={{ color: "#fca5a5" }}>{devicesError}</p>
                  </div>
                )}

                {externalDevices && !devicesLoading && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { label: "Serial Ports", value: externalDevices.serial?.length ?? 0 },
                        { label: "USB Devices", value: externalDevices.usb?.length ?? 0 },
                        { label: "Network Interfaces", value: externalDevices.network?.length ?? 0 },
                      ].map((card) => (
                        <div key={card.label} className="p-4 rounded-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-technical)" }}>
                          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#8fb4de" }}>{card.label}</div>
                          <div className="text-2xl font-bold" style={{ color: "#e2e8f0" }}>{card.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 rounded-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-technical)" }}>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {[
                          { id: "serial", label: "Serial" },
                          { id: "usb", label: "USB" },
                          { id: "network", label: "Network" },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setDevicesTab(tab.id)}
                            className="px-3 py-1 text-[10px] uppercase tracking-[0.2em] rounded-sm"
                            style={{
                              background: devicesTab === tab.id ? "rgba(34, 211, 238, 0.14)" : "rgba(34, 211, 238, 0.04)",
                              border: devicesTab === tab.id ? "1px solid rgba(34, 211, 238, 0.5)" : "1px solid rgba(34, 211, 238, 0.15)",
                              color: devicesTab === tab.id ? "#67e8f9" : "#8fb4de",
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {devicesTab === "serial" && (
                        <>
                          <h3 className="text-sm font-bold mb-2" style={{ color: "#e2e8f0" }}>Serial</h3>
                          {externalDevices.serial?.length ? (
                            <ul className="text-xs" style={{ color: "#cbd5e1" }}>
                              {externalDevices.serial.map((port) => (
                                <li key={port}>{port}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs" style={{ color: "#94a3b8" }}>No serial devices detected.</p>
                          )}
                        </>
                      )}

                      {devicesTab === "usb" && (
                        <>
                          <h3 className="text-sm font-bold mb-2" style={{ color: "#e2e8f0" }}>USB</h3>
                          {externalDevices.usb?.length ? (
                            <ul className="text-xs" style={{ color: "#cbd5e1" }}>
                              {externalDevices.usb.map((usb, idx) => (
                                <li key={`${usb}-${idx}`}>{usb}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs" style={{ color: "#94a3b8" }}>No USB devices detected.</p>
                          )}
                        </>
                      )}

                      {devicesTab === "network" && (
                        <>
                          <h3 className="text-sm font-bold mb-2" style={{ color: "#e2e8f0" }}>Network</h3>
                          {externalDevices.network?.length ? (
                            <div className="space-y-2">
                              {externalDevices.network.map((iface, idx) => (
                                <div key={`${iface.name}-${iface.address}-${idx}`} className="text-xs" style={{ color: "#cbd5e1" }}>
                                  <strong>{iface.name}</strong> · {iface.address} · {iface.family} {iface.internal ? "· internal" : ""}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs" style={{ color: "#94a3b8" }}>No network interfaces detected.</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "settings" && (
              <div className="max-w-2xl mx-auto p-8">
                <div className="space-y-6">
                  {[
                    { label: "Dark Mode", desc: "Toggle between dark and light theme", value: darkMode, onChange: () => setDarkMode((v) => !v) },
                    { label: "Show MiniMap", desc: "Display the navigation minimap on the canvas", value: showMiniMap, onChange: () => setShowMiniMap((v) => !v) },
                  ].map((setting) => (
                    <div key={setting.label} className="flex items-center justify-between py-3"
                      style={{ borderBottom: '1px solid rgba(100, 160, 220, 0.06)' }}>
                      <div>
                        <span className="text-sm" style={{ color: '#c5d5e8' }}>{setting.label}</span>
                        <p className="text-[10px] mt-0.5" style={{ color: '#4a5568' }}>{setting.desc}</p>
                      </div>
                      <button onClick={setting.onChange}
                        style={{
                          width: '44px', height: '24px', borderRadius: '12px',
                          position: 'relative', cursor: 'pointer',
                          transition: 'all 0.2s', border: 'none',
                          background: setting.value ? 'rgba(34, 211, 238, 0.3)' : 'rgba(100, 160, 220, 0.1)',
                          boxShadow: setting.value ? '0 0 8px rgba(34, 211, 238, 0.2)' : 'none',
                        }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%',
                          background: setting.value ? '#22d3ee' : '#4a5568',
                          position: 'absolute', top: '2px',
                          left: setting.value ? '22px' : '2px',
                          transition: 'all 0.2s',
                          boxShadow: setting.value ? '0 0 6px rgba(34, 211, 238, 0.4)' : 'none',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "profile" && (
              <div className="max-w-xl mx-auto p-8">
                {(() => {
                  const profileName = "Local User";
                  const profileEmail = "local@device";
                  const profileOrganization = "Local";
                  return (
                    <>
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-16 h-16 rounded-sm flex items-center justify-center text-2xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(167, 139, 250, 0.2))',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      color: '#e2e8f0',
                    }}>{profileName?.[0]?.toUpperCase() || "U"}</div>
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>{profileName}</h2>
                    <p className="text-sm" style={{ color: '#4a5568' }}>{profileEmail}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {["Display Name", "Email", "Organization"].map((field, i) => (
                    <div key={i}>
                      <label className="text-xs mb-1 block" style={{ color: '#6b7fa0' }}>{field}</label>
                      <input
                        type="text"
                        defaultValue={[profileName, profileEmail, profileOrganization][i]}
                        style={{
                          width: '100%',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-technical)',
                          borderRadius: '2px',
                          padding: '8px 12px',
                          fontSize: '11px',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          transition: 'border-color 0.2s',
                          fontFamily: "'JetBrains Mono', monospace"
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(34, 211, 238, 0.4)'; e.target.style.boxShadow = '0 0 8px rgba(34, 211, 238, 0.1)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(100, 160, 220, 0.1)'; e.target.style.boxShadow = 'none'; }}
                      />
                    </div>
                  ))}
                </div>
                    </>
                  );
                })()}
                <button
                  onClick={handleSignOut}
                  className="mt-8 w-full active:scale-95 transition-transform"
                  style={{
                    ...glassButtonBase, justifyContent: 'center', width: '100%', padding: '12px',
                    background: 'rgba(239, 68, 68, 0.06)', color: '#fca5a5',
                    borderColor: 'rgba(239, 68, 68, 0.15)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.15)'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}

            {activeSection === "premium" && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm mb-4 block inline-block"
                    style={{ background: 'var(--primary-dim)', border: '1px solid var(--primary-glow)', color: 'var(--primary-strong)' }}>PREM</span>
                  <span style={{
                    display: 'block', padding: '6px 16px', borderRadius: '2px',
                    background: 'var(--primary-dim)',
                    border: '1px solid var(--primary-glow)',
                    color: 'var(--primary)', fontSize: '11px', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em'
                  }}>
                    STANDARD_LICENSE_ACTIVE
                  </span>
                  <p className="text-[9px] mt-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Professional engineering tier enabled.
                  </p>
                </div>
              </div>
            )}

            {activeSection === "help" && (
              <div className="max-w-3xl mx-auto p-8">
                <div className="mb-4 p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-technical)', borderRadius: '2px' }}>
                  <h3 className="text-sm font-bold mb-2" style={{ color: '#e2e8f0' }}>What this app does</h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#6b7fa0' }}>
                    This workspace helps you build a visual workflow of connected components, run the workflow, and inspect
                    input/output values step by step. You can save multiple projects, reload them, and compare results quickly.
                  </p>
                </div>

                <div className="p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-technical)', borderRadius: '2px' }}>
                  <h3 className="text-sm font-bold mb-3" style={{ color: '#e2e8f0' }}>Tutorial</h3>
                  <ol className="space-y-2 text-xs" style={{ color: '#6b7fa0', paddingLeft: '16px' }}>
                    <li>Open <strong style={{ color: '#c5d5e8' }}>Workspace</strong> and drag nodes from <strong style={{ color: '#c5d5e8' }}>Library</strong> to the canvas.</li>
                    <li>Connect outputs to inputs to define the flow from left to right.</li>
                    <li>Double-click a node to inspect and edit node settings or formulas.</li>
                    <li>Click <strong style={{ color: '#c5d5e8' }}>Execute</strong> to compute the workflow.</li>
                    <li>Use execution tabs: <strong style={{ color: '#c5d5e8' }}>Inputs</strong> for starting values, <strong style={{ color: '#c5d5e8' }}>Trace</strong> for calculation path, <strong style={{ color: '#c5d5e8' }}>Output</strong> for final results.</li>
                    <li>Click <strong style={{ color: '#c5d5e8' }}>Save</strong> to store the workflow. Open <strong style={{ color: '#c5d5e8' }}>Saved Projects</strong> to reload any project later.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {(isPdfExporting || isCsvExporting) && (
        <div
          className="fixed inset-0 z-[9997] flex items-center justify-center"
          style={{ background: "rgba(4, 10, 18, 0.78)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="w-[min(420px,92vw)] p-5"
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "4px",
              boxShadow: "var(--shadow-node)",
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className="animate-spin"
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "999px",
                  border: "2px solid rgba(56, 189, 248, 0.25)",
                  borderTopColor: "#38bdf8",
                }}
              />
              <h3 className="text-sm font-bold uppercase tracking-tight" style={{ color: "#dbeafe" }}>
                {isPdfExporting ? "Processing PDF Export" : "Processing CSV Export"}
              </h3>
            </div>
            <p className="text-xs" style={{ color: "#8fb4de", lineHeight: 1.45 }}>
              {isPdfExporting
                ? "Building and paginating report containers in the background. Download will start automatically once ready."
                : "Compiling workflow export data in the background. Download will start automatically once ready."}
            </p>
          </div>
        </div>
      )}
      <CustomDialog />
    </div>
  );
}

export default function App() {
  const [isStarted, setIsStarted] = useState(false);

  const handleLaunchWorkspace = () => {
    setIsStarted(true);
  };

  const handleExitWorkspace = () => {
    setIsStarted(false);
  };

  if (!isStarted) {
    const fallbackLanding = (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#050b13] text-white">
        <div className="text-2xl font-black mb-4">TatvaLabz</div>
        <div className="text-sm text-[#9fb3c8] mb-6">Landing page failed to render. Click below to enter workspace.</div>
        <button
          onClick={handleLaunchWorkspace}
          className="px-6 py-3 rounded-md bg-[#0ea5e9] text-white font-bold uppercase text-xs tracking-widest"
        >
          Launch Workspace
        </button>
      </div>
    );
    return (
      <LandingErrorBoundary fallback={fallbackLanding}>
        <LandingPage onStart={handleLaunchWorkspace} />
      </LandingErrorBoundary>
    );
  }

  const workspaceFallback = (error) => (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#050b13] text-white">
      <div className="text-2xl font-black mb-4">TatvaLabz</div>
      <div className="text-sm text-[#9fb3c8] mb-6">Workspace failed to render. Retry or return to landing.</div>
      {error && (
        <div className="max-w-xl text-xs text-[#8fb4de] bg-[#0b1220] border border-[#1f2a3d] px-4 py-3 rounded-md mb-6">
          {String(error?.message || error)}
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={handleLaunchWorkspace}
          className="px-6 py-3 rounded-md bg-[#0ea5e9] text-white font-bold uppercase text-xs tracking-widest"
        >
          Retry Launch
        </button>
        <button
          onClick={handleExitWorkspace}
          className="px-6 py-3 rounded-md bg-transparent border border-[#2a3b52] text-[#cbd5e1] font-bold uppercase text-xs tracking-widest"
        >
          Back to Landing
        </button>
      </div>
    </div>
  );

  return (
    <WorkspaceErrorBoundary fallback={workspaceFallback}>
      <ReactFlowProvider>
        <Flow isStarted={isStarted} onExit={handleExitWorkspace} />
      </ReactFlowProvider>
    </WorkspaceErrorBoundary>
  );
}
