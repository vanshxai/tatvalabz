/**
 * App.jsx — Glassmorphic Industrial Workspace
 * Main canvas & orchestrator with frosted glass panels,
 * industrial glow accents, and refined visual hierarchy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const nodeTypes = { customNode: CustomNode };
const edgeTypes = { deletable: DeletableEdge };
const WORKSPACE_SESSION_KEY = "faulter_workspace_session";
const WORKSPACE_DRAFT_KEY = "faulter_workspace_draft";
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

function Flow() {
  const reactFlowWrapper = useRef(null);
  const quickProfileRef = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rfInstance, setRfInstance] = useState(null);
  const [compiledJson, setCompiledJson] = useState(null);
  const [backendResult, setBackendResult] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [activeTab, setActiveTab] = useState("inputs");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leafInputs, setLeafInputs] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [connectionToast, setConnectionToast] = useState(null);

  // ── Simulation Orchestrator State ──
  const [scenarios, setScenarios] = useState([]);
  const [showScenarioManager, setShowScenarioManager] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [activeSection, setActiveSection] = useState("workspace");
  const [activeSkeletonNodeId, setActiveSkeletonNodeId] = useState(null);
  const [isStarted, setIsStarted] = useState(() => {
    try {
      return localStorage.getItem(WORKSPACE_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [inspectedNodeId, setInspectedNodeId] = useState(null);
  const sortedTemplates = useMemo(() => {
    return [...TemplateRegistry].sort((a, b) => (a.complexity || 0) - (b.complexity || 0));
  }, []);
  const [selectedTemplateId, setSelectedTemplateId] = useState(sortedTemplates[0]?.id || null);
  const [projectSearch, setProjectSearch] = useState('');
  const [showQuickProfileMenu, setShowQuickProfileMenu] = useState(false);
  const [executionRecords, setExecutionRecords] = useState([]);
  const [activeCalculationPreview, setActiveCalculationPreview] = useState(null);
  const [selectedCalculationByProject, setSelectedCalculationByProject] = useState({});
  const [didRestoreDraft, setDidRestoreDraft] = useState(false);

  // ── Pyodide WebWorker State ──
  const pyodideWorkerRef = useRef(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideStatus, setPyodideStatus] = useState('Initializing...');
  const solveResolverRef = useRef(null);

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

  // ── Close quick profile menu on outside click ──
  useEffect(() => {
    const handleOutside = (e) => {
      if (showQuickProfileMenu && quickProfileRef.current && !quickProfileRef.current.contains(e.target)) {
        setShowQuickProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showQuickProfileMenu]);

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
      if (typeof draft.activeTab === "string") setActiveTab(draft.activeTab);
      if (typeof draft.showPanel === "boolean") setShowPanel(draft.showPanel);
      if (draft.isStarted) setIsStarted(true);

      const restoredUnconnected = getUnconnectedInputs(draftNodes, draftEdges);
      setLeafInputs(restoredUnconnected);
      setInputValues((prev) => {
        const next = { ...(draft.inputValues || prev) };
        restoredUnconnected.forEach(({ nodeId, inputName }) => {
          const key = makeNodeInputKey(nodeId, inputName);
          if (!(key in next)) next[key] = 0;
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
        showPanel,
        isStarted,
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
    showPanel,
    isStarted,
  ]);

  // ── Warn user before browser refresh/close if unsaved graph changes exist ──
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasPotentialDataLoss()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPotentialDataLoss]);

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

  // ── Auto-Save (Ghost Save) ──
  useEffect(() => {
    if (!currentProjectId || !isStarted) return;

    // Check if there are structural changes or result changes worth saving
    if (!hasUnsavedChanges() && !backendResult && scenarios.length === 1 && Object.keys(scenarios[0].sweeps).length === 0) {
      // Avoid aggressive saving when just clicking around an empty default project
      // But if scenarios or results exist, we should sync them.
    }

    setSyncStatus("syncing");
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      const updatedProject = buildProjectSnapshot(currentProjectId, currentProjectName);
      persistProjectSnapshot(updatedProject);
      autoSaveTimeoutRef.current = null;
    }, 1500); // 1.5s debounce

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [currentProjectId, currentProjectName, isStarted, hasUnsavedChanges, backendResult, scenarios, buildProjectSnapshot, persistProjectSnapshot]);


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

  const confirmProceedWithPotentialDataLoss = useCallback(async (nextActionLabel = "continue") => {
    if (!hasPotentialDataLoss()) return true;
    const shouldSave = await customConfirm(
      "Unsaved Workflow",
      `You have unsaved workflow changes.\n\nYes = Save before ${nextActionLabel}\nNo = Continue without saving`
    );
    if (shouldSave) {
      const saved = await handleSaveProject();
      if (!saved) return false;
    }
    return true;
  }, [hasPotentialDataLoss, handleSaveProject]);

  const handleLoadProject = async (project) => {
    const canProceed = await confirmProceedWithPotentialDataLoss(`loading "${project?.name || "this project"}"`);
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
        if (!(key in next)) next[key] = 0;
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
      setActiveTab("solver");
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

    if (hasUnsavedChanges()) {
      if (currentProjectId) {
        // Already-saved project with new changes → ask to update
        const choice = await customConfirm(
          'Unsaved Changes',
          `"${currentProjectName}" has unsaved changes.\n\nYes = Save changes before clearing\nNo = Discard changes`
        );
        if (choice) await handleSaveProject(); // silently updates in-place
      } else {
        // Brand-new unsaved workflow
        const choice = await customConfirm(
          'Unsaved Changes',
          'You have unsaved changes.\n\nYes = Save before starting new\nNo = Discard changes'
        );
        if (choice) {
          const saved = await handleSaveProject();
          if (!saved) return; // User cancelled the name prompt → abort
        }
      }
    }
    // else: no unsaved changes (e.g. loaded project, didn't touch it) → just clear

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
      const shouldSave = await customConfirm(
        "Save Current Workflow?",
        'You have unsaved changes.\n\nYes = Save before opening Saved Projects\nNo = Continue without saving'
      );
      if (shouldSave) {
        const saved = await handleSaveProject();
        if (!saved) return;
      }
    }

    setActiveSection(nextSection);
  }, [activeSection, nodes.length, edges.length, hasUnsavedChanges, handleSaveProject]);

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

  const showToast = useCallback((message, type = "error") => {
    setConnectionToast({ message, type });
    setTimeout(() => setConnectionToast(null), 3000);
  }, []);

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
        return nds.concat({
          id,
          type: "customNode",
          position,
          data: {
            label: compLabel,
            type: componentType,
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
      if (!(key in newValues)) newValues[key] = 0;
    });
    setInputValues(newValues);
    setShowPanel(true); setShowLibrary(false); setActiveTab("inputs");
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

      setBackendResult(result); setActiveTab("solver");
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

  // ── View Switching Logic ──
  const handleLaunchWorkspace = () => {
    setActiveSection("workspace");
    setIsStarted(true);
    try {
      localStorage.setItem(WORKSPACE_SESSION_KEY, "1");
    } catch {
      // Ignore localStorage write failures and keep in-memory state.
    }
  };
  const handleCloseWorkspace = async () => {
    const canProceed = await confirmProceedWithPotentialDataLoss("signing out");
    if (!canProceed) return;

    setShowQuickProfileMenu(false);
    setShowScenarioManager(false);
    setShowLibrary(false);
    setShowPanel(false);
    setInspectedNodeId(null);
    setActiveSkeletonNodeId(null);
    setActiveSection("workspace");
    setIsStarted(false);
    try {
      localStorage.removeItem(WORKSPACE_SESSION_KEY);
    } catch {
      // Ignore localStorage write failures and keep in-memory state.
    }
  };

  if (!isStarted) {
    return <LandingPage onStart={handleLaunchWorkspace} />;
  }

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
                <div className="w-8 h-8 rounded-sm outline outline-1 outline-blue-500/30 flex items-center justify-center font-bold text-lg text-blue-500 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">🔬</div>
                <div className="flex flex-col">
                  <h1 className="text-xl font-black tracking-tight flex items-baseline gap-1 m-0 text-white">
                    Tatva<span className="text-blue-500">Labz</span> <span className="text-[10px] text-blue-500 tracking-[0.2em] font-mono">CORE</span>
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
                    color: currentProjectName ? '#c5d0dc' : '#4a5568',
                    fontSize: '13px', fontWeight: 500, padding: '2px 6px',
                    borderRadius: '6px', transition: 'all 0.15s',
                    maxWidth: '220px', textOverflow: 'ellipsis', overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(100, 160, 220, 0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = currentProjectName ? '#c5d0dc' : '#4a5568'; }}
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
                  color: '#6b7fa0',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                {nodes.length}n · {edges.length}e
              </span>

              {/* New Workflow — icon only */}
              <button onClick={handleNewWorkflow}
                title="New Workflow"
                className="action-icon-btn"
                style={{
                  height: '24px', borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer', transition: 'all 0.1s ease',
                  fontSize: '9px',
                  fontWeight: 900,
                  padding: '0 10px',
                  color: '#10b981',
                  letterSpacing: '0.08em'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'; e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)'; e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'; }}
              >NEW</button>

              {/* Save — icon only */}
              <button onClick={handleSaveProject}
                title="Save Project"
                className="action-icon-btn"
                style={{
                  height: '24px', borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(100, 160, 220, 0.08)',
                  border: '1px solid rgba(103, 232, 249, 0.3)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer', transition: 'all 0.1s ease',
                  fontSize: '9px',
                  fontWeight: 900,
                  padding: '0 10px',
                  color: '#67e8f9',
                  letterSpacing: '0.08em'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(100, 160, 220, 0.15)'; e.currentTarget.style.borderColor = 'rgba(103, 232, 249, 0.5)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(100, 160, 220, 0.08)'; e.currentTarget.style.borderColor = 'rgba(103, 232, 249, 0.3)'; }}
              >SAVE</button>

              {/* Scenarios — icon only */}
              <button
                onClick={() => {
                  setShowScenarioManager((v) => { if (!v) setShowPanel(false); return !v; });
                }}
                title="Simulation Scenarios"
                className="action-icon-btn"
                style={{
                  height: '24px', borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: showScenarioManager ? 'rgba(139, 92, 246, 0.15)' : 'rgba(100, 160, 220, 0.08)',
                  border: `1px solid ${showScenarioManager ? 'rgba(139, 92, 246, 0.5)' : 'rgba(167, 139, 250, 0.3)'}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer', transition: 'all 0.1s ease',
                  fontSize: '9px',
                  fontWeight: 900,
                  padding: '0 10px',
                  color: '#a78bfa',
                  letterSpacing: '0.08em'
                }}
                onMouseEnter={(e) => {
                  if (!showScenarioManager) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showScenarioManager) {
                    e.currentTarget.style.background = 'rgba(100, 160, 220, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.3)';
                  }
                }}
              >SCENARIOS</button>

              {/* Node Library — icon only */}
              <button
                onClick={() => {
                  setShowLibrary((v) => { if (!v) setShowPanel(false); return !v; });
                }}
                title="Node Library"
                className="action-icon-btn"
                style={{
                  height: '24px', borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: showLibrary ? 'rgba(167, 139, 250, 0.15)' : 'rgba(100, 160, 220, 0.08)',
                  border: `1px solid ${showLibrary ? 'rgba(167, 139, 250, 0.5)' : 'rgba(167, 139, 250, 0.3)'}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer', transition: 'all 0.1s ease',
                  fontSize: '9px',
                  fontWeight: 900,
                  padding: '0 10px',
                  color: '#a78bfa',
                  letterSpacing: '0.08em'
                }}
                onMouseEnter={(e) => {
                  if (!showLibrary) {
                    e.currentTarget.style.background = 'rgba(167, 139, 250, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showLibrary) {
                    e.currentTarget.style.background = 'rgba(100, 160, 220, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.3)';
                  }
                }}
              >LIBRARY</button>

              {/* Run — icon only, prominent */}
              <button
                onClick={() => {
                  if (showPanel) {
                    setShowPanel(false);
                  } else {
                    handleGenerateSignatures();
                  }
                }}
                disabled={loading}
                title={loading ? 'Solving…' : 'Run Simulation'}
                className="action-icon-btn"
                style={{
                  height: '24px', borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--primary)',
                  border: '1px solid var(--primary-glow)',
                  boxShadow: '0 0 12px var(--primary-dim), 0 1px 2px rgba(0,0,0,0.3)',
                  cursor: loading ? 'wait' : 'pointer',
                  transition: 'all 0.1s ease',
                  fontSize: '10px',
                  fontWeight: 900,
                  padding: '0 14px',
                  color: '#fff',
                  letterSpacing: '0.12em'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'var(--primary-glow)';
                    e.currentTarget.style.boxShadow = '0 0 20px var(--primary-glow)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'var(--primary)';
                    e.currentTarget.style.boxShadow = '0 0 12px var(--primary-dim)';
                  }
                }}
              >{loading ? 'BUSY' : 'EXECUTE'}</button>

              {/* Quick Profile Menu */}
              <div ref={quickProfileRef} style={{ position: 'relative' }}>
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
                      top: '30px',
                      right: 0,
                      minWidth: '124px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-technical)',
                      borderRadius: '4px',
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
                        handleCloseWorkspace();
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

            {/* ── Node Library Panel ── */}
            {showLibrary && (
              <div className="w-[clamp(220px,20vw,280px)] flex flex-col shrink-0 overflow-hidden min-h-0"
                style={{
                  ...glassStyle,
                  borderLeft: '1px solid rgba(100, 160, 220, 0.08)',
                  boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
                }}>
                <div className="flex items-center justify-between px-4 py-3.5 shrink-0"
                  style={{ borderBottom: '1px solid rgba(100, 160, 220, 0.08)' }}>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>PROJECT // NODE_LIBRARY</h2>
                  <button onClick={() => setShowLibrary(false)}
                    style={{
                      color: '#4a5568', fontSize: '18px', lineHeight: 1,
                      background: 'none', border: 'none', cursor: 'pointer',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#4a5568'}
                  >×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <Sidebar customComponents={customComponents} />
                </div>
              </div>
            )}

            {/* ── Output Panel ── */}
            {showPanel && (compiledJson || backendResult) && (
              <div className="w-[clamp(300px,30vw,420px)] flex flex-col shrink-0 overflow-hidden min-h-0"
                style={{
                  ...glassStyle,
                  borderLeft: '1px solid rgba(100, 160, 220, 0.08)',
                  boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
                }}>
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-3.5 shrink-0"
                  style={{ borderBottom: '1px solid rgba(100, 160, 220, 0.08)' }}>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>DATA // COMPUTE_RESULTS</h2>
                  <button onClick={() => setShowPanel(false)}
                    style={{ color: '#4a5568', fontSize: '18px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#4a5568'}
                  >×</button>
                </div>

                {/* Tabs */}
                <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(100, 160, 220, 0.06)' }}>
                  {[
                    { key: "inputs", label: "INPUTS", color: "#f97316", count: leafInputs.length },
                    { key: "compiled", label: "TRACE", color: "#22d3ee" },
                    { key: "solver", label: "OUTPUT", color: "#10b981" },
                  ].map((tab) => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className="flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors"
                      style={{
                        color: activeTab === tab.key ? tab.color : '#4a5568',
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
                  {/* ── Inputs Tab ── */}
                  {activeTab === "inputs" && (
                    <div className="h-full overflow-y-auto p-4">
                      {leafInputs.length === 0 ? (
                        <p className="text-xs text-center py-8" style={{ color: '#4a5568' }}>
                          All inputs are already connected in this workflow. You can run solve directly.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-[11px]" style={{ color: '#6b7fa0' }}>
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
                                background: 'rgba(14, 20, 35, 0.4)',
                                border: '1px solid rgba(100, 160, 220, 0.08)',
                              }}>
                              <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(100, 160, 220, 0.06)' }}>
                                <span className="text-[10px] font-bold uppercase tracking-tight" style={{ color: '#e2e8f0' }}>
                                  LAYER 1 // {group.nodeLabel}
                                </span>
                              </div>
                              <div className="p-3 space-y-2">
                                {group.inputs.map(({ inputName }) => (
                                  <div key={`${nodeId}_${inputName}`} className="flex items-center gap-2">
                                    <label className="text-[11px] w-28 shrink-0 truncate" title={inputName}
                                      style={{ color: '#93c5fd', fontFamily: "'JetBrains Mono', monospace" }}>
                                      {inputName}
                                    </label>
                                    <input
                                      type="number" step="any"
                                      value={inputValues[makeNodeInputKey(nodeId, inputName)] ?? inputValues[inputName] ?? 0}
                                      onChange={(e) =>
                                        setInputValues((prev) => ({
                                          ...prev,
                                          [makeNodeInputKey(nodeId, inputName)]: parseFloat(e.target.value) || 0,
                                        }))
                                      }
                                      style={{
                                        flex: 1,
                                        background: 'rgba(6, 10, 16, 0.5)',
                                        border: '1px solid rgba(100, 160, 220, 0.1)',
                                        borderRadius: '8px',
                                        padding: '5px 8px',
                                        fontSize: '12px',
                                        color: '#e2e8f0',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        minWidth: 0,
                                      }}
                                      onFocus={(e) => e.target.style.borderColor = 'rgba(34, 211, 238, 0.4)'}
                                      onBlur={(e) => e.target.style.borderColor = 'rgba(100, 160, 220, 0.1)'}
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
                              background: loading ? 'rgba(100, 160, 220, 0.04)' : 'rgba(16, 185, 129, 0.1)',
                              color: loading ? '#4a5568' : '#6ee7b7',
                              borderColor: loading ? 'rgba(100, 160, 220, 0.05)' : 'rgba(16, 185, 129, 0.25)',
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

                  {/* ── Compiled Graph Tab → Execution Trace ── */}
                  {activeTab === "compiled" && compiledJson && (
                    <div className="h-full overflow-y-auto">
                      <ExecutionTrace compiledJson={compiledJson} backendResult={backendResult} />
                    </div>
                  )}

                  {/* ── Solver Tab ── */}
                  {activeTab === "solver" && (
                    <div className="h-full overflow-y-auto p-4">
                      {error && !loading && (
                        <div className="p-3 text-xs rounded-xl"
                          style={{
                            background: 'rgba(127, 29, 29, 0.3)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#fca5a5',
                          }}>
                          <p className="font-bold mb-1">❌ Backend Error</p>
                          <p>{error}</p>
                        </div>
                      )}

                      {backendResult && !loading && (
                        <ResultsDashboard result={backendResult} compiledJson={compiledJson} />
                      )}

                      {!backendResult && !loading && !error && (
                        <p className="text-xs text-center py-8" style={{ color: '#4a5568' }}>
                          Click "Process" to solve the graph
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scenario Manager Overlay ── */}
      {activeSection === "workspace" && showScenarioManager && (
        <ScenarioManager
          scenarios={scenarios}
          setScenarios={setScenarios}
          activeScenarioId={activeScenarioId}
          setActiveScenarioId={setActiveScenarioId}
          onClose={() => setShowScenarioManager(false)}
        />
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
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-16 h-16 rounded-sm flex items-center justify-center text-2xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(167, 139, 250, 0.2))',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      color: '#e2e8f0',
                    }}>U</div>
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>User</h2>
                    <p className="text-sm" style={{ color: '#4a5568' }}>user@example.com</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {["Display Name", "Email", "Organization"].map((field, i) => (
                    <div key={i}>
                      <label className="text-xs mb-1 block" style={{ color: '#6b7fa0' }}>{field}</label>
                      <input
                        type="text"
                        defaultValue={["User", "user@example.com", "Faulter Labs"][i]}
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
                <button
                  onClick={handleCloseWorkspace}
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
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-blue-600/10 border border-blue-500/30 text-blue-500 mb-4 block inline-block">PREM</span>
                  <span style={{
                    display: 'block', padding: '6px 16px', borderRadius: '2px',
                    background: 'var(--primary-dim)', border: '1px solid var(--primary-glow)',
                    color: 'var(--primary)', fontSize: '11px', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em'
                  }}>
                    STANDARD_LICENSE_ACTIVE
                  </span>
                  <p className="text-[9px] mt-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Professional engineering tier enabled.</p>
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
      <CustomDialog />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
