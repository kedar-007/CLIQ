'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Search,
  Grid3X3,
  List,
  Upload,
  Download,
  Trash2,
  X,
  File,
  FileImage,
  FileText,
  FileVideo,
  FileAudio,
  FileArchive,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Attachment } from '@comms/types';

type ViewMode = 'grid' | 'list';
type FileFilter = 'All' | 'Images' | 'Documents' | 'Videos' | 'Audio' | 'Archives';

interface UploadFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface PresignResponse {
  success: boolean;
  data: {
    uploadUrl: string;
    fileKey: string;
    fileId: string;
  };
}

const FILTER_MIME: Record<FileFilter, RegExp | null> = {
  All: null,
  Images: /^image\//,
  Documents: /^(application\/(pdf|msword|vnd\.openxmlformats|vnd\.ms-|vnd\.oasis)|text\/)/,
  Videos: /^video\//,
  Audio: /^audio\//,
  Archives: /^application\/(zip|x-zip|x-rar|x-tar|x-7z|gzip)/,
};

function getFileIcon(mimeType: string, className = 'w-8 h-8') {
  if (mimeType.startsWith('image/')) return <FileImage className={cn(className, 'text-blue-500')} />;
  if (mimeType.startsWith('video/')) return <FileVideo className={cn(className, 'text-purple-500')} />;
  if (mimeType.startsWith('audio/')) return <FileAudio className={cn(className, 'text-green-500')} />;
  if (/^application\/(zip|x-zip|x-rar|x-tar|x-7z|gzip)/.test(mimeType))
    return <FileArchive className={cn(className, 'text-yellow-500')} />;
  if (mimeType.startsWith('text/') || mimeType.includes('document') || mimeType.includes('pdf'))
    return <FileText className={cn(className, 'text-red-500')} />;
  return <File className={cn(className, 'text-gray-500')} />;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function FilesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FileFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lightboxFile, setLightboxFile] = useState<Attachment | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: filesData, isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const res = await fetchApi<{ success: boolean; data: Attachment[] }>('/api/files');
      return res.data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      fetchApi(`/api/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setConfirmDeleteId(null);
    },
  });

  const allFiles = filesData ?? [];

  const filteredFiles = allFiles.filter((f) => {
    const mimeRegex = FILTER_MIME[filter];
    if (mimeRegex && !mimeRegex.test(f.mimeType)) return false;
    if (searchQuery && !f.fileName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleFileSelect = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return;

      const newUploads: UploadFile[] = Array.from(selectedFiles).map((file) => ({
        file,
        progress: 0,
        status: 'pending',
      }));

      setUploadFiles(newUploads);
      setShowUploadModal(true);

      for (let i = 0; i < newUploads.length; i++) {
        const upload = newUploads[i];
        try {
          setUploadFiles((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, status: 'uploading', progress: 10 } : u))
          );

          // Step 1: Get presigned URL
          const presignRes = await fetchApi<PresignResponse>('/api/files/presign', {
            method: 'POST',
            body: JSON.stringify({
              fileName: upload.file.name,
              mimeType: upload.file.type,
              fileSize: upload.file.size,
            }),
          });

          setUploadFiles((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, progress: 30 } : u))
          );

          // Step 2: Upload to presigned URL
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const pct = 30 + Math.round((e.loaded / e.total) * 60);
                setUploadFiles((prev) =>
                  prev.map((u, idx) => (idx === i ? { ...u, progress: pct } : u))
                );
              }
            });
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`Upload failed: ${xhr.status}`));
            });
            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.open('PUT', presignRes.data.uploadUrl);
            xhr.setRequestHeader('Content-Type', upload.file.type);
            xhr.send(upload.file);
          });

          setUploadFiles((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, progress: 90 } : u))
          );

          // Step 3: Confirm upload
          await fetchApi('/api/files/confirm', {
            method: 'POST',
            body: JSON.stringify({ fileId: presignRes.data.fileId }),
          });

          setUploadFiles((prev) =>
            prev.map((u, idx) => (idx === i ? { ...u, progress: 100, status: 'done' } : u))
          );
        } catch (err) {
          setUploadFiles((prev) =>
            prev.map((u, idx) =>
              idx === i
                ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
                : u
            )
          );
        }
      }

      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    [queryClient]
  );

  const handleDownload = async (file: Attachment) => {
    try {
      const res = await fetchApi<{ success: boolean; data: { downloadUrl: string } }>(
        `/api/files/${file.id}/download-url`
      );
      const a = document.createElement('a');
      a.href = res.data.downloadUrl;
      a.download = file.fileName;
      a.click();
    } catch {
      window.open(file.fileUrl, '_blank');
    }
  };

  const lightboxFiles = filteredFiles.filter((f) => f.mimeType.startsWith('image/'));
  const lightboxIdx = lightboxFile
    ? lightboxFiles.findIndex((f) => f.id === lightboxFile.id)
    : -1;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-wrap">
        <h1 className="text-xl font-bold text-foreground mr-2">Files</h1>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-1">
          {(['All', 'Images', 'Documents', 'Videos', 'Audio', 'Archives'] as FileFilter[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {f}
              </button>
            )
          )}
        </div>

        {/* View Toggle */}
        <div className="flex gap-1 border border-border rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted/50'
            )}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Upload Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                : 'space-y-2'
            )}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <div className="text-5xl mb-4">📁</div>
            <p className="font-medium text-lg">No files found</p>
            <p className="text-sm mt-1">
              {searchQuery ? 'Try a different search term' : 'Upload files to get started'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredFiles.map((file) => {
              const isImage = file.mimeType.startsWith('image/');
              const isOwner = file.uploaderId === user?.id;

              return (
                <div
                  key={file.id}
                  className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    if (isImage) setLightboxFile(file);
                    else handleDownload(file);
                  }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square flex items-center justify-center bg-muted/50 p-4">
                    {isImage && file.thumbnailUrl ? (
                      <img
                        src={file.thumbnailUrl}
                        alt={file.fileName}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : isImage && file.fileUrl ? (
                      <img
                        src={file.fileUrl}
                        alt={file.fileName}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      getFileIcon(file.mimeType, 'w-10 h-10')
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2">
                    <p className="text-xs font-medium text-foreground truncate" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBytes(file.fileSize)}
                    </p>
                  </div>

                  {/* Actions overlay */}
                  <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                      className="p-1 bg-background/90 rounded-md hover:bg-background transition-colors"
                      title="Download"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    {isOwner && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(file.id);
                        }}
                        className="p-1 bg-background/90 rounded-md hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Size
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Date
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
                  const isOwner = file.uploaderId === user?.id;
                  const isImage = file.mimeType.startsWith('image/');
                  return (
                    <tr
                      key={file.id}
                      className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType, 'w-5 h-5')}
                          <span
                            className="text-sm font-medium text-foreground truncate max-w-[200px] cursor-pointer hover:text-primary"
                            onClick={() => {
                              if (isImage) setLightboxFile(file);
                              else handleDownload(file);
                            }}
                          >
                            {file.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {file.mimeType.split('/')[1]?.toUpperCase() ?? file.mimeType}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatBytes(file.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                        {format(
                          parseISO(
                            file.createdAt instanceof Date
                              ? file.createdAt.toISOString()
                              : String(file.createdAt)
                          ),
                          'MMM d, yyyy'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {isImage && (
                            <button
                              onClick={() => setLightboxFile(file)}
                              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                              title="Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => setConfirmDeleteId(file.id)}
                              className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-500 transition-colors text-muted-foreground"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Progress Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-card rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground">Uploading Files</h2>
              {uploadFiles.every((u) => u.status === 'done' || u.status === 'error') && (
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadFiles([]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {uploadFiles.map((upload, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-foreground truncate flex-1 mr-2">
                      {upload.file.name}
                    </span>
                    <span
                      className={cn('text-xs font-medium', {
                        'text-green-500': upload.status === 'done',
                        'text-red-500': upload.status === 'error',
                        'text-muted-foreground': upload.status === 'uploading' || upload.status === 'pending',
                      })}
                    >
                      {upload.status === 'done'
                        ? 'Done'
                        : upload.status === 'error'
                        ? 'Error'
                        : `${upload.progress}%`}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-200', {
                        'bg-primary': upload.status !== 'error',
                        'bg-red-500': upload.status === 'error',
                      })}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                  {upload.error && (
                    <p className="text-xs text-red-500 mt-1">{upload.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxFile && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxFile(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors"
            onClick={() => setLightboxFile(null)}
          >
            <X className="w-6 h-6" />
          </button>

          {lightboxIdx > 0 && (
            <button
              className="absolute left-4 p-2 text-white/80 hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxFile(lightboxFiles[lightboxIdx - 1]);
              }}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          <img
            src={lightboxFile.fileUrl}
            alt={lightboxFile.fileName}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {lightboxIdx < lightboxFiles.length - 1 && (
            <button
              className="absolute right-4 p-2 text-white/80 hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxFile(lightboxFiles[lightboxIdx + 1]);
              }}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          <div className="absolute bottom-4 text-white/70 text-sm">
            {lightboxFile.fileName} — {formatBytes(lightboxFile.fileSize)}
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div className="relative bg-card rounded-xl border border-border shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Delete File</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete this file? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
