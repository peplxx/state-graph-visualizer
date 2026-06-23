import React, { useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { parseFile } from '../core/parser';
import type { GraphFile } from '../types/graph';

interface Props {
  onLoad: (graph: GraphFile, filename: string) => void;
  onError: (msg: string) => void;
}

export const FileLoader: React.FC<Props> = ({ onLoad, onError }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const graph = parseFile(content, file.name);
        onLoad(graph, file.name);
      } catch (err) {
        onError(`Parse error: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div
      className={`file-loader ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".yaml,.yml,.json,.toml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />
      <Upload size={32} strokeWidth={1.2} />
      <p>Drop a graph file here or click to browse</p>
      <p className="file-hint">
        <FileText size={12} /> Supports YAML · JSON · TOML
      </p>
    </div>
  );
};
