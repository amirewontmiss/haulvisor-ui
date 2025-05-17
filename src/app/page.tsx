// File: haulvisor-ui/src/app/page.tsx
'use client'; 

// Removed FormEvent as it was unused
import { useState, useEffect } from 'react';

// Base URL for your HaulVisor API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

// Define interfaces for API responses
interface CompileResponse {
  qasm?: string;
  error?: string;
}

interface RunResponse extends CompileResponse {
  job_id?: string;
  logs?: Record<string, unknown> | string; 
  result?: unknown; // Changed from any
}

interface DispatchResponse {
  job_id: string;
  message: string;
  qasm?: string;
}

interface JobStatusData {
  id?: string;
  status?: string;
  submitted?: string;
  completed?: string;
  error_message?: string;
  result_summary?: string;
  model_name?: string;
  circ?: string;
  gate_count?: number;
  circuit_depth?: number; 
  qubits?: number;
  [key: string]: unknown; // Allow other dynamic fields, but typed as unknown
}

interface JobStatusResponse {
  job_id: string;
  status_data: JobStatusData;
}


export default function HaulVisorPage() {
  const [circuitJson, setCircuitJson] = useState<string>(
`{
  "name": "BellState",
  "qubits": 2,
  "shots": 1024,
  "gates": [
    { "op": "H", "target": 0 },
    { "op": "CX", "control": 0, "target": 1 },
    { "op": "MEASURE", "target": 0 },
    { "op": "MEASURE", "target": 1 }
  ]
}`
  );
  const [backend, setBackend] = useState<string>('pennylane');
  const [priority, setPriority] = useState<string>('normal');
  const [retries, setRetries] = useState<number>(3);
  const [availableBackends, setAvailableBackends] = useState<string[]>(['pennylane', 'qiskit', 'braket', 'ibm']);

  const [qasmOutput, setQasmOutput] = useState<string>('Awaiting circuit submission...');
  const [jobLog, setJobLog] = useState<string>('Awaiting job activity...');
  const [resultOutput, setResultOutput] = useState<string>('Awaiting results...');
  const [jobIdToCheck, setJobIdToCheck] = useState<string>('');
  const [statusCheckOutput, setStatusCheckOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string>('');

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/devices`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: string[] = await response.json();
        if (data && data.length > 0) {
          setAvailableBackends(data);
          if (!data.includes(backend)) { 
            setBackend(data[0]);
          }
        }
      } catch (error) {
        console.error("Failed to fetch devices:", error);
        setApiError("Could not fetch available backends. Using defaults.");
      }
    };
    fetchDevices();
  }, [backend]); // Added 'backend' to dependency array


  const displayMessage = (setter: React.Dispatch<React.SetStateAction<string>>, message: string) => { // Removed unused isError
    setter(message);
  };

  const displayStructuredOutput = (setter: React.Dispatch<React.SetStateAction<string>>, data: unknown) => { // Changed data type to unknown
    if (typeof data === 'object' && data !== null) {
      setter(JSON.stringify(data, null, 2));
    } else if (data !== undefined && data !== null) {
      setter(String(data));
    }
     else {
      setter("N/A"); 
    }
  };

  const commonFetch = async (endpoint: string, payload: Record<string, unknown>, method: string = 'POST'): Promise<any> => { // Return Promise<any> or a more specific type
    setIsLoading(true);
    setApiError(''); 
    try {
      const options: RequestInit = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
      };
      if (method === 'POST' || method === 'PUT') {
        options.body = JSON.stringify(payload);
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `Request failed with status ${response.status}` }));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error: unknown) { // Changed error type to unknown
      console.error(`Error calling ${endpoint}:`, error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      setApiError(`API Error: ${errorMessage}`);
      throw error; 
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCompileOnly = async () => {
    displayMessage(setQasmOutput, "Compiling circuit...");
    setJobLog(""); 
    setResultOutput("");
    const payload = { circuit_json_str: circuitJson, backend: backend };
    try {
        const data: CompileResponse = await commonFetch("/compile", payload);
        displayStructuredOutput(setQasmOutput, data.qasm || "No QASM returned.");
        if (data.error) {
            setApiError(`Compilation Error: ${data.error}`);
            displayMessage(setQasmOutput, `Compilation failed: ${data.error}`);
        }
    } catch (error: unknown) { // Changed error type to unknown
        const errorMessage = error instanceof Error ? error.message : "An unknown compilation error occurred";
        displayMessage(setQasmOutput, `Compilation failed: ${errorMessage}`);
    }
  };

  const handleRunSynchronously = async () => {
    displayMessage(setQasmOutput, "Processing...");
    displayMessage(setJobLog, `Submitting job to ${backend} (sync)...`);
    displayMessage(setResultOutput, "Running...");

    const payload = {
      circuit_json_str: circuitJson,
      backend,
      priority,
      retries: Number(retries),
    };

    try {
      const data: RunResponse = await commonFetch("/run", payload);
      displayStructuredOutput(setQasmOutput, data.qasm || "QASM not available from this run.");
      displayStructuredOutput(setJobLog, data.logs || `Synchronous run completed for backend: ${backend}. Job ID: ${data.job_id || 'N/A'}`);
      displayStructuredOutput(setResultOutput, data.result || data.error || "No result data.");
      if(data.error) setApiError(`Run Error: ${data.error}`);
    } catch (error: unknown) { // Changed error type to unknown
      const errorMessage = error instanceof Error ? error.message : "An unknown run error occurred";
      displayMessage(setQasmOutput, "Run failed.");
      displayMessage(setJobLog, `Error: ${errorMessage}`);
      displayMessage(setResultOutput, "Failed.");
    }
  };

  const handleDispatchAsynchronously = async () => {
    displayMessage(setQasmOutput, "Processing...");
    displayMessage(setJobLog, `Dispatching job to ${backend} (async)...`);
    displayMessage(setResultOutput, "Awaiting job ID...");
    
    const payload = {
      circuit_json_str: circuitJson,
      backend,
      priority,
      retries: Number(retries),
    };

    try {
      const data: DispatchResponse = await commonFetch("/dispatch", payload);
      displayStructuredOutput(setQasmOutput, data.qasm || "QASM not available from dispatch.");
      displayStructuredOutput(setJobLog, `${data.message}\nJob ID: ${data.job_id}`);
      displayMessage(setResultOutput, "Job dispatched. Check status with ID.");
      setJobIdToCheck(data.job_id); 
    } catch (error: unknown) { // Changed error type to unknown
      const errorMessage = error instanceof Error ? error.message : "An unknown dispatch error occurred";
      displayMessage(setQasmOutput, "Dispatch failed.");
      displayMessage(setJobLog, `Error: ${errorMessage}`);
      displayMessage(setResultOutput, "Dispatch failed.");
    }
  };

  const handleCheckStatus = async () => {
    const jobId = jobIdToCheck.trim();
    if (!jobId) {
      displayMessage(setStatusCheckOutput, "Please enter a Job ID.");
      return;
    }
    setIsLoading(true);
    setApiError('');
    displayMessage(setStatusCheckOutput, `Checking status for Job ID: ${jobId}...`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      const data: JobStatusResponse = await response.json();
      displayStructuredOutput(setStatusCheckOutput, data.status_data || "No status data found.");
    } catch (error: unknown) { // Changed error type to unknown
      console.error(`Error checking status for ${jobId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching status";
      setApiError(`API Error: ${errorMessage}`);
      displayMessage(setStatusCheckOutput, `Error fetching status: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const labelClass = "block mb-1.5 text-sm font-medium text-slate-300";
  const inputBaseClass = "w-full p-2.5 bg-slate-700 border border-slate-600 text-slate-200 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 disabled:bg-slate-800 disabled:text-slate-400 placeholder-slate-400";
  const textareaClass = `${inputBaseClass} min-h-[250px] font-mono text-xs leading-relaxed`;
  const selectClass = `${inputBaseClass}`;
  const numberInputClass = `${inputBaseClass}`;
  const buttonClass = "px-6 py-2.5 rounded-md font-semibold text-white transition-all duration-150 ease-in-out disabled:opacity-60 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900";
  const primaryButtonClass = `${buttonClass} bg-sky-600 hover:bg-sky-500 focus:ring-sky-500`;
  const secondaryButtonClass = `${buttonClass} bg-slate-600 hover:bg-slate-500 focus:ring-slate-500`;
  const tertiaryButtonClass = `${buttonClass} bg-teal-600 hover:bg-teal-500 focus:ring-teal-500`;
  const outputBoxClass = "bg-slate-800 border border-slate-700 text-slate-300 rounded-md p-4 mt-1 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto shadow-inner";
  const cardClass = "bg-slate-800/70 backdrop-blur-md p-6 rounded-xl shadow-2xl border border-slate-700";

  return (
    <main className="p-4 md:p-8 bg-slate-900 min-h-screen font-sans text-slate-200">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">HaulVisor</h1>
          <p className="text-xl text-slate-400 mt-2">Quantum Circuit Orchestration Interface</p>
        </header>

        {apiError && (
          <div className="mb-6 p-4 bg-red-800/50 border border-red-600 text-red-200 rounded-md">
            <strong>API Error:</strong> {apiError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className={cardClass}>
            <h2 className="text-2xl font-semibold mb-6 text-slate-100 border-b border-slate-700 pb-3">Circuit Configuration</h2>
            <div className="mb-5">
              <label htmlFor="circuitJson" className={labelClass}>Circuit JSON Definition:</label>
              <textarea 
                id="circuitJson" 
                className={textareaClass}
                placeholder="Paste your circuit JSON here..."
                value={circuitJson}
                onChange={(e) => setCircuitJson(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              <div>
                <label htmlFor="backend" className={labelClass}>Target Backend:</label>
                <select id="backend" className={selectClass} value={backend} onChange={(e) => setBackend(e.target.value)} disabled={isLoading}>
                  {availableBackends.map(b => <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="priority" className={labelClass}>Job Priority:</label>
                <select id="priority" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={isLoading}>
                  <option value="normal">Normal (Default)</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="mb-8">
              <label htmlFor="retries" className={labelClass}>Max Retries:</label>
              <input 
                type="number" 
                id="retries" 
                className={numberInputClass}
                value={retries}
                onChange={(e) => setRetries(parseInt(e.target.value, 10))}
                min="0"
                disabled={isLoading}
              />
            </div>
            <div className="flex flex-col space-y-3">
              <button onClick={handleCompileOnly} className={`${tertiaryButtonClass} w-full`} disabled={isLoading}>
                 {isLoading ? 'Processing...' : 'Compile QASM Only'}
              </button>
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mt-3">
                <button onClick={handleRunSynchronously} className={`${primaryButtonClass} flex-1`} disabled={isLoading}>
                  {isLoading ? 'Processing...' : 'Run Synchronously'} 
                </button>
                <button onClick={handleDispatchAsynchronously} className={`${secondaryButtonClass} flex-1`} disabled={isLoading}>
                  {isLoading ? 'Processing...' : 'Dispatch Asynchronously'}
                </button>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-2xl font-semibold mb-6 text-slate-100 border-b border-slate-700 pb-3">Execution Outputs</h2>
            <div className="mb-5">
              <label htmlFor="qasmOutput" className={labelClass}>Generated QASM:</label>
              <div id="qasmOutput" className={outputBoxClass}>{qasmOutput}</div>
            </div>
            <div className="mb-5">
              <label htmlFor="jobLog" className={labelClass}>Job Log / Status:</label>
              <div id="jobLog" className={outputBoxClass}>{jobLog}</div>
            </div>
            <div>
              <label htmlFor="resultOutput" className={labelClass}>Result:</label>
              <div id="resultOutput" className={outputBoxClass}>{resultOutput}</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} mt-8`}>
          <h2 className="text-2xl font-semibold mb-6 text-slate-100 border-b border-slate-700 pb-3">Check Job Status</h2>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 items-end mb-4">
            <div className="flex-grow w-full sm:w-auto">
              <label htmlFor="jobIdInput" className={labelClass}>Job ID:</label>
              <input 
                type="text" 
                id="jobIdInput" 
                className={inputBaseClass}
                placeholder="Enter Job ID"
                value={jobIdToCheck}
                onChange={(e) => setJobIdToCheck(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <button onClick={handleCheckStatus} className={`${primaryButtonClass} w-full sm:w-auto`} disabled={isLoading}>
              {isLoading ? 'Checking...' : 'Check Status'}
            </button>
          </div>
          {statusCheckOutput && ( 
            <div id="statusCheckOutput" className={outputBoxClass}>
              {statusCheckOutput}
            </div>
          )}
        </div>
         <footer className="text-center mt-16 mb-8 py-4 text-slate-500 text-sm">
            <p>HaulVisor UI v0.2.1 - Lint Fixes</p>
        </footer>
      </div>
    </main>
  );
}

