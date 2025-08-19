import React, { useCallback, useMemo, useRef, useState } from 'react'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const onUpload = useCallback(() => {
    if (!file) return;
    setProgress(0);
    setStatus('Bezig met uploaden...');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setProgress(percent);
      }
    });

    const form = new FormData();
    form.append('file', file);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          setResult(data);
          setStatus('Klaar!');
        } else {
          setStatus('Mislukt: ' + xhr.responseText);
        }
      }
    };

    xhr.send(form);
  }, [file]);

  const dragProps = {
    onDragOver: (e) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop,
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="py-10 text-center">
        <h1 className="text-3xl font-bold">Bestanden uploaden</h1>
        <p className="text-gray-600 mt-2">Sleep een bestand hierheen of klik om te kiezen. Na uploaden krijg je een deelbare link.</p>
      </header>

      <div
        {...dragProps}
        className={`rounded-2xl border-2 ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-dashed border-gray-300 bg-white'} p-10 text-center transition`}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <div className="space-y-2">
            <div className="font-medium">{file.name}</div>
            <div className="text-sm text-gray-500">{formatBytes(file.size)}</div>
            <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-sm underline">Ander bestand</button>
          </div>
        ) : (
          <div className="text-gray-500">
            <div className="text-lg">Klik om te kiezen of sleep hierheen</div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          disabled={!file}
          onClick={onUpload}
          className={`px-5 py-2 rounded-xl ${file ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'} transition`}
        >
          Uploaden
        </button>
        <div className="text-sm text-gray-600">{status}</div>
      </div>

      {progress > 0 && progress < 100 && (
        <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
          <div className="h-3 rounded-full bg-indigo-600 transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      {result && (
        <div className="mt-8 p-5 rounded-2xl bg-white border border-gray-200">
          <div className="text-lg font-semibold mb-2">Deelbare link</div>
          <div className="flex items-center gap-2">
            <input className="flex-1 px-3 py-2 rounded-lg border" readOnly value={result.downloadPage} />
            <button
              onClick={() => navigator.clipboard.writeText(result.downloadPage)}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white"
            >
              Kopieer
            </button>
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Vervalt op: {new Date(result.expiresAt * 1000).toLocaleString()}
          </div>
        </div>
      )}

      <footer className="mt-16 text-center text-xs text-gray-500">
        Gemaakt met ❤️ — Verzend geen zeer gevoelige data zonder extra beveiliging.
      </footer>
    </div>
  )
}
