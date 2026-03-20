import { create } from 'zustand';

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  status: string;
}

interface WorkspaceState {
  members: WorkspaceMember[];
  setMembers: (members: WorkspaceMember[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  members: [],
  setMembers: (members) => set({ members }),
}));
