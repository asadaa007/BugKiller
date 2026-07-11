import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useProjects } from '../context/ProjectContext';
import { useBugs } from '../context/BugContext';
import { useAuth } from '../context/AuthContext';
import { useTeams } from '../context/TeamContext';
import { getAllUsers } from '../services/userService';
import type { AppUser } from '../types/auth';
import Navigation from '../components/layout/Navigation';
import Loading from '../components/common/Loading';
// import BugForm from '../components/dashboard/BugForm';
import { projectService } from '../services/projectService';
import { bugService } from '../services/bugService';
import type { KanbanColumn } from '../types/projects';
import { 
  Plus, 
  Bug, 
  Settings, 
  Calendar, 
  ArrowLeft,
  Filter,
  Search,
  Trash2,
  X,
  CheckSquare,
  Square,
  Edit2,
  Edit,
  Save,
  MessageSquare,
  User,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Button, IconButton } from '../components/common/buttons';
import MarkdownRenderer from '../components/common/MarkdownRenderer';
import MarkdownEditor from '../components/common/MarkdownEditor';
import type { Bug as BugType, BugStatus, BugPriority } from '../types/bugs';
import type { Project } from '../types/projects';

const Kanban = () => {
  const { projectId: rawProjectId, slug } = useParams<{ projectId?: string; slug?: string }>();
  const navigate = useNavigate();
  
  // Decode the projectId if it was URL encoded
  const projectId = rawProjectId ? decodeURIComponent(rawProjectId) : undefined;
  const { projects, loading: projectsLoading } = useProjects();
  const { bugs, loading: bugsLoading, updateBug, deleteBug } = useBugs();
  const { user } = useAuth();
  const { teams } = useTeams();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Role-based permissions: allow super_admin/manager/team_lead; allow team_member only if QC/QA team
  const canCreateBug = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'manager' || user.role === 'team_lead') return true;
    if (user.role === 'team_member') {
      const team = user.teamId ? teams.find(t => t.id === user.teamId) : undefined;
      if (team?.name) {
        const name = team.name.toLowerCase();
        return name.includes('qa') || name.includes('qc') || name.includes('quality');
      }
    }
    return false;
  }, [user, teams]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBug, setSelectedBug] = useState<BugType | null>(null);
  const [showBugDetails, setShowBugDetails] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const manuallyClosedRef = useRef(false);

  // Bug view panel states
  const [showAssigneeSelector, setShowAssigneeSelector] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [availableLabels] = useState<string[]>([
    'Blocker', 'Bug', 'Bugherd', 'Content Bug', 'Content Production', 'Duplicate',
    'enhancement', 'Fixed', 'good first issue', 'Help Wanted', 'Invalid', 'Not fixed',
    'On Hold', 'Question', 'Question Answered', 'Task', 'Verified', 'Won\'t fix'
  ]);

  // Find project by ID or slug
  useEffect(() => {
    const findProject = async () => {
      setLoading(true);
      try {
        let foundProject = null;
        
        if (projectId) {
          // Always fetch fresh data from database to get latest custom columns
            foundProject = await projectService.getProjectById(projectId);
          if (!foundProject) {
            // Fallback to context if database fetch fails
            foundProject = projects.find(p => p.id === projectId);
          }
        } else if (slug) {
          // Always fetch fresh data from database to get latest custom columns
            foundProject = await projectService.getProjectBySlug(slug);
          if (!foundProject) {
            // Fallback to context if database fetch fails
            foundProject = projects.find(p => p.slug === slug);
          }
        }
        
        setProject(foundProject || null);
      } catch (error) {
        console.error('Error fetching project:', error);
        // Fallback to context data
        if (projectId) {
          const fallbackProject = projects.find(p => p.id === projectId);
          setProject(fallbackProject || null);
        } else if (slug) {
          const fallbackProject = projects.find(p => p.slug === slug);
          setProject(fallbackProject || null);
        }
      } finally {
        setLoading(false);
      }
    };

    if (projectId || slug) {
      findProject();
    }
  }, [projectId, slug]);

  // Load custom columns when project is loaded
  useEffect(() => {
    if (project) {
      if (project.customColumns && project.customColumns.length > 0) {
        // Use custom columns from project
        setKanbanColumns(project.customColumns);
      } else {
        // Use default columns if no custom columns exist
        setKanbanColumns(defaultColumns);
      }
    }
  }, [project]);

  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingColumnTitle, setEditingColumnTitle] = useState('');

  // Find the current project
  // Project is now managed by state

  // Load users for assignee filter
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await getAllUsers();
        setAllUsers(users);
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };
    loadUsers();
  }, []);

  // Handle URL parameters for assignee filter
  useEffect(() => {
    if (allUsers.length > 0) {
      const urlAssignee = searchParams.get('assignee');
      if (urlAssignee) {
        const user = findUserBySlug(urlAssignee);
        if (user) {
          setAssigneeFilter(user.name);
        }
      }
    }
  }, [searchParams, allUsers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAssigneeDropdown && assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAssigneeDropdown]);

  // Auto-open bug form if ?newBug=1 and user can create
  React.useEffect(() => {
    if (searchParams.get('newBug') === '1' && canCreateBug) {
      navigate('/bugs/add');
    }
  }, [searchParams, canCreateBug, navigate]);

  // Auto-open bug from URL parameter
  React.useEffect(() => {
    const bugIdFromUrl = searchParams.get('bugId');
    
    // Reset manuallyClosedRef if bugId is removed from URL AND panel is closed
    if (!bugIdFromUrl && !showBugDetails && !selectedBug) {
      manuallyClosedRef.current = false;
      return;
    }
    
    // Only auto-open if:
    // 1. bugId exists in URL
    // 2. Panel is not already showing
    // 3. User didn't manually close it
    // 4. Project and bugs are loaded
    if (bugIdFromUrl && project && bugs.length > 0 && !showBugDetails && !selectedBug && !manuallyClosedRef.current) {
      // Find the bug - handle both formats with and without #
      const foundBug = bugs.find(bug => 
        bug.id === bugIdFromUrl || 
        bug.id === `#${bugIdFromUrl}` || 
        bug.id.replace('#', '') === bugIdFromUrl.replace('#', '')
      );
      
      if (foundBug && foundBug.projectId === project.id) {
        handleViewBug(foundBug);
        // Reset the flag after opening so it can be opened again if needed
        manuallyClosedRef.current = false;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, project, bugs, showBugDetails, selectedBug]);
  
  // Filter bugs for this project
  const projectBugs = bugs.filter(bug => bug.projectId === project?.id);

  // Apply search and filters
  const filteredBugs = projectBugs.filter(bug => {
    const matchesSearch = searchTerm === '' || 
      bug.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bug.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bug.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority = filterPriority.length === 0 || filterPriority.includes(bug.priority);

    const matchesAssignee = assigneeFilter === '' || 
      (bug.assigneeName && bug.assigneeName.toLowerCase() === assigneeFilter.toLowerCase()) ||
      (bug.externalAssigneeName && bug.externalAssigneeName.toLowerCase() === assigneeFilter.toLowerCase());

    return matchesSearch && matchesPriority && matchesAssignee;
  });

  // Default Kanban columns
  const defaultColumns: KanbanColumn[] = [
    { id: 'new', title: 'ToDo', color: 'bg-blue-50 border-blue-200', isDefault: true },
    { id: 'in-progress', title: 'In Progress', color: 'bg-yellow-50 border-yellow-200', isDefault: true },
    { id: 'revision', title: 'Revision', color: 'bg-orange-50 border-orange-200', isDefault: true },
    { id: 'ready-for-qc', title: 'Ready for QC', color: 'bg-purple-50 border-purple-200', isDefault: true },
    { id: 'in-qc', title: 'In QC', color: 'bg-indigo-50 border-indigo-200', isDefault: true },
    { id: 'completed', title: 'Completed', color: 'bg-green-50 border-green-200', isDefault: true },
  ];

  // Enhanced Kanban columns with database-like structure
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>(defaultColumns);

  const getBugsForColumn = (columnId: string) => {
    return filteredBugs.filter(bug => bug.status === columnId);
  };

  // Helper functions for assignee filtering
  const createUserSlug = (user: AppUser) => {
    const slug = user.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug;
  };

  const findUserBySlug = (slug: string) => {
    return allUsers.find(user => createUserSlug(user) === slug);
  };

  const handleAssigneeSelect = (user: AppUser) => {
    setAssigneeFilter(user.name);
    setAssigneeSearchTerm('');
    setShowAssigneeDropdown(false);
    
    // Update URL
    const params = new URLSearchParams(searchParams);
    params.set('assignee', createUserSlug(user));
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleAssigneeClick = (assigneeName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening bug details
    
    // Toggle filter: if already filtered by this user, clear it; otherwise, set it
    if (assigneeFilter.toLowerCase() === assigneeName.toLowerCase()) {
      // Already filtered by this user - clear the filter
      setAssigneeFilter('');
      const params = new URLSearchParams(searchParams);
      params.delete('assignee');
      navigate(`?${params.toString()}`, { replace: true });
    } else {
      // Filter by this user
      setAssigneeFilter(assigneeName);
      
      // Update URL if user exists in allUsers
      const user = allUsers.find(u => u.name === assigneeName);
      if (user) {
        const params = new URLSearchParams(searchParams);
        params.set('assignee', createUserSlug(user));
        navigate(`?${params.toString()}`, { replace: true });
      }
    }
  };

  const handleAssigneeClear = () => {
    setAssigneeFilter('');
    setAssigneeSearchTerm('');
    setShowAssigneeDropdown(false);
    
    // Update URL
    const params = new URLSearchParams(searchParams);
    params.delete('assignee');
    navigate(`?${params.toString()}`, { replace: true });
  };

  const filteredUsers = allUsers.filter(user => 
    user.name.toLowerCase().includes(assigneeSearchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800';
      case 'revision': return 'bg-orange-100 text-orange-800';
      case 'ready-for-qc': return 'bg-purple-100 text-purple-800';
      case 'in-qc': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDisplayName = (status: string) => {
    switch (status) {
      case 'new': return 'ToDo';
      case 'in-progress': return 'In Progress';
      case 'revision': return 'Revision';
      case 'ready-for-qc': return 'Ready for QC';
      case 'in-qc': return 'In QC';
      case 'completed': return 'Completed';
      default: return status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };


  const handleViewBug = async (bug: BugType) => {
    try {
      // Fetch fresh bug data from database to ensure all users see the same data
      const freshBug = await bugService.getBugById(bug.id);
      if (freshBug) {
        
        // Ensure history is properly formatted and sorted by timestamp
        if (freshBug.history && Array.isArray(freshBug.history)) {
          freshBug.history = freshBug.history
            .map(historyItem => ({
              ...historyItem,
              userName: historyItem.userName || 'Unknown',
              field: historyItem.field || 'general',
              action: historyItem.action || 'Changed',
              createdAt: historyItem.createdAt || new Date()
            }))
            .sort((a, b) => {
              const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
              const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
              return dateB.getTime() - dateA.getTime();
            });
        }
        
        // Initialize comments from bug data
        if (freshBug.comments && Array.isArray(freshBug.comments)) {
          setComments(freshBug.comments);
        } else {
          setComments([]);
        }
        
        setSelectedBug(freshBug);
        setShowBugDetails(true);
      } else {
        // Fallback to local bug data if database fetch fails
        console.log('Using local bug data:', bug);
        setSelectedBug(bug);
        setShowBugDetails(true);
      }
    } catch (error) {
      console.error('Error fetching fresh bug data:', error);
      // Fallback to local bug data
      setSelectedBug(bug);
      setShowBugDetails(true);
    }
  };

  const handleCloseBugPanel = () => {
    manuallyClosedRef.current = true;
    setShowBugDetails(false);
    setSelectedBug(null);
    // Remove bugId from URL query parameters
    const params = new URLSearchParams(searchParams);
    params.delete('bugId');
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleEditBug = (bug: BugType) => {
    navigate(`/bugs/${bug.id}/edit`);
  };

  const handleDeleteBug = async (bugId: string) => {
    if (!confirm('Are you sure you want to delete this bug? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteBug(bugId);
      handleCloseBugPanel();
    } catch (error) {
      alert('Failed to delete bug');
    }
  };

  // Bug view panel handlers
  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedBug || !user) return;
    
    try {
      const comment = {
        id: Date.now().toString(),
        content: newComment,
        author: user.name,
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Add comment to bug in database
      const updatedComments = [...(selectedBug.comments || []), comment];
      await updateBug(selectedBug.id, {
        comments: updatedComments,
        userId: user.id,
        userName: user.name
      });
      
      // Update local state
      setSelectedBug(prev => prev ? {
        ...prev,
        comments: updatedComments
      } : null);
      
      setComments(updatedComments);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleAssigneeChange = async (newAssignee: AppUser) => {
    if (!selectedBug || !user) return;
    
    try {
      // Create history entry
      const historyEntry = {
        id: Date.now().toString(),
        field: 'assignee',
        action: `assigned to ${newAssignee.name}`,
        userName: user.name,
        userId: user.id,
        createdAt: new Date(),
        oldValue: selectedBug.assigneeName || 'unassigned',
        newValue: newAssignee.name
      };

      // Update bug assignee with history
      await updateBug(selectedBug.id, {
        assignee: newAssignee.id,
        assigneeName: newAssignee.name,
        history: [...(selectedBug.history || []), historyEntry],
        userId: user.id,
        userName: user.name
      });
      
      // Update local state
      setSelectedBug(prev => prev ? {
        ...prev,
        assignee: newAssignee.id,
        assigneeName: newAssignee.name,
        history: [...(prev.history || []), historyEntry]
      } : null);
      
      setShowAssigneeSelector(false);
    } catch (error) {
      console.error('Error updating assignee:', error);
    }
  };

  const handleAddLabel = (label: string) => {
    if (!selectedBug || !user) return;
    
    const currentLabels = selectedBug.labels || [];
    if (!currentLabels.includes(label)) {
      const updatedLabels = [...currentLabels, label];
      
      // Create history entry
      const historyEntry = {
        id: Date.now().toString(),
        field: 'labels',
        action: `added label "${label}"`,
        userName: user.name,
        userId: user.id,
        createdAt: new Date(),
        newValue: label
      };

      // Update bug labels with history
      updateBug(selectedBug.id, { 
        labels: updatedLabels,
        history: [...(selectedBug.history || []), historyEntry],
        userId: user.id,
        userName: user.name
      });
      
      // Update local state
      setSelectedBug(prev => prev ? {
        ...prev,
        labels: updatedLabels,
        history: [...(prev.history || []), historyEntry]
      } : null);
    }
  };

  const handleRemoveLabel = (label: string) => {
    if (!selectedBug || !user) return;
    
    const currentLabels = selectedBug.labels || [];
    const updatedLabels = currentLabels.filter(l => l !== label);
    
    // Create history entry
    const historyEntry = {
      id: Date.now().toString(),
      field: 'labels',
      action: `removed label "${label}"`,
      userName: user.name,
      userId: user.id,
      createdAt: new Date(),
      oldValue: label
    };
    
    // Update bug labels with history
    updateBug(selectedBug.id, { 
      labels: updatedLabels,
      history: [...(selectedBug.history || []), historyEntry],
      userId: user.id,
      userName: user.name
    });
    
    // Update local state
    setSelectedBug(prev => prev ? {
      ...prev,
      labels: updatedLabels,
      history: [...(prev.history || []), historyEntry]
    } : null);
  };

  const handleTypeChange = async (newType: string) => {
    if (!selectedBug || !user) return;
    
    try {
      // Create history entry
      const historyEntry = {
        id: Date.now().toString(),
        field: 'priority',
        action: `changed priority to ${newType}`,
        userName: user.name,
        userId: user.id,
        createdAt: new Date(),
        oldValue: selectedBug.priority,
        newValue: newType
      };

      // Update bug type/priority with history
      await updateBug(selectedBug.id, { 
        priority: newType as BugPriority,
        history: [...(selectedBug.history || []), historyEntry],
        userId: user.id,
        userName: user.name
      });
      
      // Update local state
      setSelectedBug(prev => prev ? {
        ...prev,
        priority: newType as BugPriority,
        history: [...(prev.history || []), historyEntry]
      } : null);
      
      setShowTypeSelector(false);
    } catch (error) {
      console.error('Error updating type:', error);
    }
  };

  const getLabelColor = (label: string) => {
    const colors: { [key: string]: string } = {
      'Blocker': 'bg-red-100 text-red-800 border-red-200',
      'Bug': 'bg-orange-100 text-orange-800 border-orange-200',
      'Bugherd': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Content Bug': 'bg-red-100 text-red-800 border-red-200',
      'Content Production': 'bg-green-100 text-green-800 border-green-200',
      'Duplicate': 'bg-blue-100 text-blue-800 border-blue-200',
      'enhancement': 'bg-teal-100 text-teal-800 border-teal-200',
      'Fixed': 'bg-green-100 text-green-800 border-green-200',
      'good first issue': 'bg-purple-100 text-purple-800 border-purple-200',
      'Help Wanted': 'bg-pink-100 text-pink-800 border-pink-200',
      'Invalid': 'bg-gray-100 text-gray-800 border-gray-200',
      'Not fixed': 'bg-red-100 text-red-800 border-red-200',
      'On Hold': 'bg-purple-100 text-purple-800 border-purple-200',
      'Question': 'bg-orange-100 text-orange-800 border-orange-200',
      'Question Answered': 'bg-blue-100 text-blue-800 border-blue-200',
      'Task': 'bg-teal-100 text-teal-800 border-teal-200',
      'Verified': 'bg-green-100 text-green-800 border-green-200',
      'Won\'t fix': 'bg-yellow-100 text-yellow-800 border-yellow-200'
    };
    return colors[label] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const handleStatusChange = async (bugId: string, newStatus: BugStatus) => {
    try {
      await updateBug(bugId, { 
        status: newStatus,
        userId: user?.id,
        userName: user?.name || user?.email
      });
    } catch (error) {
      // Error updating bug status
    }
  };

  const handleAddColumn = () => {
    const newColumnId = `custom-${Date.now()}`;
    const newColumn: KanbanColumn = {
      id: newColumnId,
      title: 'New Column',
      color: 'bg-primary/5 border-primary/20',
      isDefault: false
    };
    setKanbanColumns([...kanbanColumns, newColumn]);
  };

  const handleDeleteColumn = (columnId: string) => {
    const column = kanbanColumns.find(col => col.id === columnId);
    if (column?.isDefault) {
      alert('Cannot delete default columns');
      return;
    }
    
    if (confirm(`Are you sure you want to delete the column "${column?.title}"? All bugs in this column will be moved to "New".`)) {
      // Move bugs to "new" column
      const bugsInColumn = getBugsForColumn(columnId);
      bugsInColumn.forEach(async (bug) => {
        await handleStatusChange(bug.id, 'new');
      });
      
      // Remove column
      setKanbanColumns(prev => prev.filter(col => col.id !== columnId));
    }
  };

  const handleEditColumnTitle = (columnId: string) => {
    const column = kanbanColumns.find(col => col.id === columnId);
    if (column) {
      setEditingColumn(columnId);
      setEditingColumnTitle(column.title);
    }
  };

  const handleSaveColumnTitle = async (columnId: string) => {
    try {
      // Update local state
      const updatedColumns = kanbanColumns.map(col => 
        col.id === columnId 
          ? { ...col, title: editingColumnTitle }
          : col
      );
      setKanbanColumns(updatedColumns);
      
      // Save to project in database
      if (project) {
        await projectService.updateProject(project.id, {
          customColumns: updatedColumns
        });
      }
      
    setEditingColumn(null);
    setEditingColumnTitle('');
    } catch (error) {
      console.error('Error saving column title:', error);
      // Revert local state on error
      setKanbanColumns(kanbanColumns);
    }
  };

  const handleDragStart = (e: React.DragEvent, bugId: string) => {
    e.dataTransfer.setData('bugId', bugId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: BugStatus) => {
    e.preventDefault();
    const bugId = e.dataTransfer.getData('bugId');
    if (bugId) {
      await handleStatusChange(bugId, targetStatus);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityDotColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const clearFilters = () => {
    setFilterPriority([]);
    setSearchTerm('');
  };

  if (loading || projectsLoading || bugsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading project..." />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
            <p className="text-gray-600 mb-4">The project you're looking for doesn't exist.</p>
            <Button
              onClick={() => navigate('/projects')}
              variant="primary"
              icon={ArrowLeft}
            >
              Back to Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 relative">
      <Navigation />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Slim Professional Header - Single Row */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between space-x-4">
            {/* Left Section - Project Info & Breadcrumb */}
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 text-sm text-gray-600">
                  <span className="hover:text-gray-900 transition-colors cursor-pointer">Projects</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-900 font-medium">{project.name}</span>
            </div>
            </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Active</span>
          </div>
        </div>

            {/* Center Section - Search and Assignee Filter */}
            <div className="flex-1 max-w-2xl mx-4 flex space-x-3">
              {/* Search Field */}
              <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search bugs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <X className="w-3 h-3" />
                </button>
              )}
            </div>
            
              {/* Assignee Filter */}
              <div className="flex-1 relative">
                <div className="relative">
                  {/* Show pill inside input when assignee is selected */}
                  {assigneeFilter ? (
                    <div className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center min-h-[40px] relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <div className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                        <User className="w-3 h-3 mr-1" />
                        {assigneeFilter}
                        <button
                          onClick={handleAssigneeClear}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Filter by assignee..."
                        value={assigneeSearchTerm}
                        onChange={(e) => {
                          setAssigneeSearchTerm(e.target.value);
                          setShowAssigneeDropdown(true);
                        }}
                        onFocus={() => setShowAssigneeDropdown(true)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Assignee Dropdown */}
                {showAssigneeDropdown && !assigneeFilter && (
                  <div ref={assigneeDropdownRef} className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleAssigneeSelect(user)}
                          className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 flex items-center"
                        >
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                            <User className="w-3 h-3 text-blue-600" />
                          </div>
                          {user.name}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500">No users found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Section - Actions & Filters */}
            <div className="flex items-center space-x-3">
              {/* Filter Button */}
            <div className="relative">
              <button 
                onClick={() => setShowFilterPopup(!showFilterPopup)}
                  className={`flex items-center px-3 py-2 border rounded-lg transition-all duration-200 text-sm ${
                  filterPriority.length > 0
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <Filter className="w-4 h-4 mr-1.5" />
                  <span className="font-medium">Filter</span>
                  {filterPriority.length > 0 && (
                    <span className="ml-1.5 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
                      {filterPriority.length}
                    </span>
                  )}
              </button>

              {/* Filter Popup */}
              {showFilterPopup && (
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Filter Bugs</h3>
                      <button
                        onClick={() => setShowFilterPopup(false)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                      <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                          <div className="space-y-1">
                          {['low', 'medium', 'high', 'critical'].map((priority) => (
                            <label key={priority} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={filterPriority.includes(priority)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFilterPriority([...filterPriority, priority]);
                                  } else {
                                    setFilterPriority(filterPriority.filter(p => p !== priority));
                                  }
                                }}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="ml-2 text-sm text-gray-700 capitalize">{priority}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-4">
                      <button
                        onClick={clearFilters}
                          className="text-sm text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                      >
                        Clear all
                      </button>
                      <button
                        onClick={() => setShowFilterPopup(false)}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-medium transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

              {/* Clear Filters */}
            {(filterPriority.length > 0 || searchTerm) && (
              <button
                onClick={clearFilters}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                  Clear
              </button>
            )}

              {/* Add Bug Button */}
              {canCreateBug && (
                <Button
                  onClick={() => navigate('/bugs/add')}
                  variant="primary"
                  icon={Plus}
                  size="sm"
                  className="shadow-sm"
                >
                  Add Bug
                </Button>
              )}

              {/* Settings */}
              <IconButton
                icon={Settings}
                variant="default"
                size="sm"
                className="hover:bg-gray-100"
              />
            </div>
          </div>
        </div>

        {/* Kanban Board - Enhanced Professional Design */}
        <div className="flex-1 flex overflow-x-auto overflow-y-hidden bg-gradient-to-br from-gray-50 to-gray-100">
          {kanbanColumns.map((column) => {
            const columnBugs = getBugsForColumn(column.id);
            return (
              <div 
                key={column.id} 
                className="flex-shrink-0 w-80 p-3"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id as BugStatus)}
              >
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 h-full flex flex-col overflow-hidden">
                  {/* Column Header - Enhanced */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      {editingColumn === column.id ? (
                        <div className="flex items-center space-x-2 flex-1">
                          <input
                            type="text"
                            value={editingColumnTitle}
                            onChange={(e) => setEditingColumnTitle(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveColumnTitle(column.id)}
                            className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 flex-1">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <h3 className="font-semibold text-gray-900 text-sm">
                            {column.title}
                          </h3>
                          <button
                            onClick={() => handleEditColumnTitle(column.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                          {columnBugs.length}
                        </span>
                        {!column.isDefault && (
                          <button
                            onClick={() => handleDeleteColumn(column.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete column"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Column Content - Enhanced */}
                  <div className="flex-1 p-3 space-y-3 overflow-y-auto bg-gray-50/30">
                    {columnBugs.map((bug, index) => (
                      <div
                        key={`${bug.id}-${bug.projectId}-${index}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, bug.id)}
                        className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer group hover:border-blue-300"
                        onClick={() => handleViewBug(bug)}
                      >
                        {/* Bug Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 text-sm font-semibold text-gray-900">
                              <span className="font-mono text-sm font-bold text-gray-700 flex-shrink-0 pr-2 border-r border-gray-300">
                                {bug.id.startsWith('#') ? bug.id : `#${bug.id}`}
                              </span>
                              <h4 className="font-semibold text-gray-900 text-sm line-clamp-2 leading-tight flex-1 min-w-0">
                                {bug.title}
                              </h4>
                            </div>
                          </div>
                          <div className="ml-2 flex-shrink-0">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(bug.priority)}`}>
                            {bug.priority}
                          </span>
                          </div>
                        </div>
                        
                        {/* Bug Meta Info */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                              {new Date(bug.createdAt).toLocaleDateString()}
                            </div>
                            <div className="flex items-center">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              {bug.comments?.length || 0}
                          </div>
                        </div>
                        
                          {(bug.assigneeName || bug.externalAssigneeName) && (
                            <button
                              onClick={(e) => handleAssigneeClick(bug.assigneeName || bug.externalAssigneeName || '', e)}
                              className={`flex items-center text-xs transition-colors group ${
                                assigneeFilter.toLowerCase() === (bug.assigneeName || bug.externalAssigneeName || '').toLowerCase()
                                  ? 'text-blue-600 font-semibold'
                                  : 'text-gray-600 hover:text-blue-600'
                              }`}
                              title={
                                assigneeFilter.toLowerCase() === (bug.assigneeName || bug.externalAssigneeName || '').toLowerCase()
                                  ? `Remove filter for ${bug.assigneeName || bug.externalAssigneeName}`
                                  : `Filter by ${bug.assigneeName || bug.externalAssigneeName}`
                              }
                            >
                              <div className={`w-2 h-2 ${getPriorityDotColor(bug.priority)} rounded-full mr-2`}></div>
                              <div className={`rounded-full border bg-gray-200 mr-1.5 p-0.5 transition-colors ${
                                assigneeFilter.toLowerCase() === (bug.assigneeName || bug.externalAssigneeName || '').toLowerCase()
                                  ? 'border-blue-600'
                                  : 'border-gray-300 group-hover:border-blue-600'
                              }`}>
                                <User className={`w-3 h-3 transition-colors ${
                                  assigneeFilter.toLowerCase() === (bug.assigneeName || bug.externalAssigneeName || '').toLowerCase()
                                    ? 'text-blue-600'
                                    : 'text-gray-600 group-hover:text-blue-600'
                                }`} />
                              </div>
                              <span className="truncate font-semibold">{bug.assigneeName || bug.externalAssigneeName}</span>
                            </button>
                          )}
                        </div>
                        
                        {/* Bug Actions */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                              <Bug className="w-3 h-3 text-gray-500" />
                          </div>
                            <span className="text-xs text-gray-500">Bug</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const newStatus = bug.status === 'completed' ? 'new' : 'completed';
                              handleStatusChange(bug.id, newStatus);
                            }}
                            className={`p-1.5 rounded-lg transition-all duration-200 ${
                              bug.status === 'completed' 
                                ? 'text-green-600 bg-green-50 hover:bg-green-100' 
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title={bug.status === 'completed' ? 'Reopen bug' : 'Mark as complete'}
                          >
                            {bug.status === 'completed' ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {/* Empty State - Enhanced */}
                    {columnBugs.length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                          <Bug className="w-8 h-8 opacity-50" />
                        </div>
                        <p className="text-sm font-medium text-gray-500 mb-1">No bugs in this column</p>
                        <p className="text-xs text-gray-400">Drag bugs here or create new ones</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Add Column Button - Enhanced */}
          <div className="flex-shrink-0 w-80 p-3">
            <button
              onClick={handleAddColumn}
              className="w-full h-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 group"
            >
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium">Add Column</p>
              <p className="text-xs text-gray-400 mt-1">Create a new workflow stage</p>
            </button>
          </div>
        </div>
      </div>

      {/* Bug Details Absolute Panel */}
      {showBugDetails && selectedBug && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="flex-1 bg-black bg-opacity-50"
            onClick={handleCloseBugPanel}
          />
          
          {/* Right Side Panel */}
          <div className="w-1/2 bg-white shadow-2xl flex flex-col h-full border-l border-gray-200">
          {/* Panel Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-gray-900 font-mono flex-shrink-0 pr-3 border-r border-gray-300">
                    {selectedBug.id.startsWith('#') ? selectedBug.id : `#${selectedBug.id}`}
                  </span>
                  <h3 className="text-xl font-bold text-gray-900 leading-tight line-clamp-2">
                    {selectedBug.title}
                  </h3>
                </div>
            </div>
            <button
                onClick={handleCloseBugPanel}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-200 transition-colors ml-4 flex-shrink-0"
              >
                <X className="w-5 h-5" />
            </button>
          </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto flex">
              {/* Main Content Area - Left Side */}
              <div className="flex-1 p-6">
                {/* Reporter Info */}
                <div className="flex items-center mb-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
              <div>
                    <p className="text-sm font-medium text-gray-900">{selectedBug.reporterName || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(selectedBug.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
              </div>

                {/* Description Section - Separate Box */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Description</h4>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="prose prose-sm max-w-none">
                      <MarkdownRenderer content={selectedBug.description} />
                    </div>
                  </div>
                </div>

                {/* Activity Timeline and Comments */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Activity & Comments</h4>
                  
                  {/* Activity Timeline */}
                  <div className="mb-6">
                    <div className="space-y-4">
                      {/* Bug Created */}
                      <div className="flex items-start space-x-3">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Plus className="w-3 h-3 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span 
                                className="text-sm font-medium text-gray-900 cursor-help"
                                title={selectedBug.reporterName}
                              >
                                {selectedBug.reporterName?.split(' ')[0] || 'Unknown'}
                              </span>
                              <span className="text-xs text-gray-500">created this bug</span>
                      </div>
                            <span className="text-xs text-gray-400">
                              {new Date(selectedBug.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                    </div>
                        </div>
                      </div>

                      {/* Combined Timeline - History and Comments */}
                      {(() => {
                        interface TimelineItem {
                          id: string;
                          type: 'history' | 'comment';
                          timestamp: Date;
                          fullName: string;
                          firstName: string;
                          changeType?: string;
                          actionText?: string;
                          historyItem?: typeof selectedBug.history[0];
                          comment?: typeof comments[0];
                        }
                        
                        // Combine history and comments into a single timeline
                        const timelineItems: TimelineItem[] = [];
                        
                        // Add history items
                        if (selectedBug.history && selectedBug.history.length > 0) {
                          selectedBug.history.forEach((historyItem, index) => {
                            const fullName = historyItem.userName || user?.name || 'Unknown';
                            const firstName = fullName.split(' ')[0];
                            
                            // Handle different timestamp formats with robust parsing
                            let timestamp: Date;
                            try {
                              if (historyItem.createdAt) {
                                timestamp = historyItem.createdAt instanceof Date 
                                  ? historyItem.createdAt 
                                  : new Date(historyItem.createdAt);
                              } else {
                                timestamp = new Date();
                              }
                              
                              // Validate the timestamp
                              if (isNaN(timestamp.getTime())) {
                                timestamp = new Date();
                              }
                            } catch (error) {
                              timestamp = new Date();
                            }
                            
                            const changeType = historyItem.field || 'general';
                            const actionText = historyItem.action || 'Changed';
                            
                            
                            timelineItems.push({
                              id: `history-${index}`,
                              type: 'history',
                              timestamp,
                              fullName,
                              firstName,
                              changeType,
                              actionText,
                              historyItem
                            });
                          });
                        }
                        
                        // Add comments
                        if (comments && comments.length > 0) {
                          comments.forEach(comment => {
                            const fullName = comment.author || 'Unknown';
                            const firstName = fullName.split(' ')[0];
                            
                            let timestamp: Date;
                            try {
                              timestamp = comment.createdAt instanceof Date 
                                ? comment.createdAt 
                                : new Date(comment.createdAt);
                              
                              // Validate the timestamp
                              if (isNaN(timestamp.getTime())) {
                                timestamp = new Date();
                              }
                            } catch (error) {
                              timestamp = new Date();
                            }
                            
                            timelineItems.push({
                              id: comment.id,
                              type: 'comment',
                              timestamp,
                              fullName,
                              firstName,
                              comment
                            });
                          });
                        }
                        
                        // Sort by timestamp (oldest first - chronological order)
                        timelineItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                        
                        return timelineItems.map((item) => {
                          if (item.type === 'history' && item.historyItem) {
                            const historyItem = item.historyItem;
                            return (
                              <div key={item.id} className="flex items-start space-x-3">
                                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  {item.changeType === 'assignee' ? (
                                    <User className="w-3 h-3 text-green-600" />
                                  ) : item.changeType === 'status' ? (
                                    <Clock className="w-3 h-3 text-yellow-600" />
                                  ) : item.changeType === 'priority' ? (
                                    <AlertCircle className="w-3 h-3 text-orange-600" />
                                  ) : item.changeType === 'labels' ? (
                                    <MessageSquare className="w-3 h-3 text-blue-600" />
                                  ) : (
                                    <Edit className="w-3 h-3 text-gray-600" />
                  )}
                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span 
                                        className="text-sm font-medium text-gray-900 cursor-help"
                                        title={item.fullName}
                                      >
                                        {item.firstName}
                                      </span>
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs text-gray-500">
                                          {item.changeType === 'priority' ? 'changed priority' : 
                                           item.changeType === 'labels' ? (historyItem.action?.includes('removed') ? 'removed label' : 'added label') :
                                           item.changeType === 'status' ? 'changed status' : item.actionText}
                                        </span>
                                        {item.changeType === 'priority' && historyItem.oldValue && (
                                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor((() => {
                                            const rawValue = historyItem.oldValue;
                                            if (rawValue && typeof rawValue === 'string' && rawValue.includes('Changed from') && rawValue.includes('to')) {
                                              const match = rawValue.match(/from\s(.*?)\s+to/);
                                              return match && match[1] ? match[1] : rawValue;
                                            }
                                            return rawValue;
                                          })())}`}>
                                            {(() => {
                                              const rawValue = historyItem.oldValue;
                                              if (rawValue && typeof rawValue === 'string' && rawValue.includes('Changed from') && rawValue.includes('to')) {
                                                const match = rawValue.match(/from\s(.*?)\s+to/);
                                                return match && match[1] ? match[1] : rawValue;
                                              }
                                              return rawValue;
                                            })()}
                                          </span>
                                        )}
                                        {item.changeType === 'priority' && (() => {
                                          const rawNewValue = historyItem.newValue || 
                                                             historyItem.action?.replace('Priority changed to ', '') ||
                                                             'unknown';
                                          let displayNewValue = rawNewValue;
                                          if (typeof rawNewValue === 'string' && rawNewValue.includes('Changed from') && rawNewValue.includes('to')) {
                                            const match = rawNewValue.match(/to\s(.*?)$/);
                                            if (match && match[1]) {
                                              displayNewValue = match[1];
                                            }
                                          }
                                          return (
                                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(displayNewValue)}`}>
                                              {displayNewValue}
                                            </span>
                                          );
                                        })()}
                                        {item.changeType === 'status' && historyItem.oldValue && (() => {
                                          const rawValue = historyItem.oldValue;
                                          let statusValue = rawValue;
                                          if (rawValue && typeof rawValue === 'string' && rawValue.includes('Changed from') && rawValue.includes('to')) {
                                            const match = rawValue.match(/from\s(.*?)\s+to/);
                                            statusValue = match && match[1] ? match[1] : rawValue;
                                          }
                                          return (
                                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(statusValue)}`}>
                                              {getStatusDisplayName(statusValue)}
                                            </span>
                                          );
                                        })()}
                                        {item.changeType === 'status' && (() => {
                                          const rawNewValue = historyItem.newValue || 
                                                             historyItem.action?.replace('Status changed to ', '') ||
                                                             'unknown';
                                          let displayNewValue = rawNewValue;
                                          if (typeof rawNewValue === 'string' && rawNewValue.includes('Changed from') && rawNewValue.includes('to')) {
                                            const match = rawNewValue.match(/to\s(.*?)$/);
                                            if (match && match[1]) {
                                              displayNewValue = match[1];
                                            }
                                          }
                                          return (
                                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(displayNewValue)}`}>
                                              {getStatusDisplayName(displayNewValue)}
                                            </span>
                                          );
                                        })()}
                                        {item.changeType === 'labels' && (() => {
                                          let labelValue = historyItem.newValue || historyItem.action || 'unknown';
                                          
                                          // Remove "Added label:" or "Removed label:" prefixes
                                          if (typeof labelValue === 'string') {
                                            labelValue = labelValue.replace(/.*?(Added|Removed)\s+label:\s*/, '');
                                          }
                                          
                                          return (
                                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getLabelColor(labelValue)}`}>
                                              {labelValue}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs text-gray-400">
                                        {item.timestamp.toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric'
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            // Comment item
                            return (
                              <div key={item.id} className="flex items-start space-x-3">
                                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <MessageSquare className="w-3 h-3 text-gray-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span 
                                        className="text-sm font-medium text-gray-900 cursor-help"
                                        title={item.fullName}
                                      >
                                        {item.firstName}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {item.timestamp.toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric'
                                        })}
                                      </span>
                                    </div>
                                    <div className="prose prose-sm max-w-none">
                                      <MarkdownRenderer content={item.comment.content} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                        });
                      })()}
                    </div>
                  </div>

                  {/* Add Comment Section with Markdown Editor */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <h5 className="text-sm font-medium text-gray-900">Add a comment</h5>
                    </div>
                    
                    {/* Markdown Editor */}
                    <MarkdownEditor
                      value={newComment}
                      onChange={setNewComment}
                      placeholder="Use Markdown to format your comment"
                      className="mb-3"
                    />

                    {/* Comment Actions */}
                    <div className="flex justify-end mt-3">
                <button 
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                        Comment
                </button>
              </div>
                  </div>
                </div>
                </div>

              {/* Sidebar Sections - Right Side */}
              <div className="w-72 border-l border-gray-200 p-4 space-y-4">
                {/* Assignees */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Assignees</label>
                  <button 
                    onClick={() => setShowAssigneeSelector(!showAssigneeSelector)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {showAssigneeSelector ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search users..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => setAssigneeSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {allUsers.filter(user => 
                        user.name.toLowerCase().includes(assigneeSearchTerm.toLowerCase())
                      ).map(user => (
                        <button
                          key={user.id}
                          onClick={() => handleAssigneeChange(user)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-lg flex items-center"
                        >
                          <User className="w-4 h-4 mr-2 text-gray-400" />
                          {user.name}
                        </button>
                      ))}
                </div>
                  </div>
                ) : (
                  <>
                    {selectedBug.assigneeName ? (
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-2">
                          <User className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-sm text-gray-900">{selectedBug.assigneeName}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No assignees</p>
                    )}
                  </>
                )}

                {/* Labels */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Labels</label>
                  <button 
                    onClick={() => setShowLabelManager(!showLabelManager)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {showLabelManager ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {availableLabels.map(label => (
                        <button
                          key={label}
                          onClick={() => handleAddLabel(label)}
                          className={`px-2 py-1 text-xs rounded-full border ${getLabelColor(label)} hover:opacity-80`}
                        >
                          {label}
                        </button>
                      ))}
                </div>
                  </div>
                ) : (
                  <>
                    {selectedBug.labels && selectedBug.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedBug.labels.map((label, index) => (
                          <div key={index} className="flex items-center">
                            <span className={`px-2 py-1 text-xs rounded-full border ${getLabelColor(label)}`}>
                              {label}
                            </span>
                            <button
                              onClick={() => handleRemoveLabel(label)}
                              className="ml-1 text-gray-400 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No labels</p>
                    )}
                  </>
                )}

                {/* Type */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <button 
                    onClick={() => setShowTypeSelector(!showTypeSelector)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
              </div>

                {showTypeSelector ? (
                  <div className="space-y-2">
                    {['low', 'medium', 'high', 'critical'].map(type => (
                      <button
                        key={type}
                        onClick={() => handleTypeChange(type)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 ${selectedBug.priority === type ? 'bg-blue-100 text-blue-800' : ''}`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                </div>
                ) : (
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(selectedBug.priority)}`}>
                    {selectedBug.priority.charAt(0).toUpperCase() + selectedBug.priority.slice(1)}
                  </span>
                )}

                {/* Projects */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Projects</label>
                  <button className="text-gray-400 hover:text-gray-600">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                        <div className="flex items-center">
                    <div className="w-4 h-4 bg-gray-200 rounded mr-2 flex items-center justify-center">
                      <Bug className="w-3 h-3 text-gray-600" />
                          </div>
                    <span className="text-sm text-gray-900">{selectedBug.projectName || 'Unknown Project'}</span>
                  </div>
                  <div className="ml-6">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">Status</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedBug.status)}`}>
                        {getStatusDisplayName(selectedBug.status)}
                          </span>
                        </div>
                      </div>
                    </div>
              </div>
                </div>

            {/* Panel Footer */}
            <div className="border-t border-gray-200 p-6 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <IconButton
                    onClick={() => handleEditBug(selectedBug)}
                    icon={Edit2}
                    variant="default"
                    size="sm"
                    title="Edit Bug"
                  />
                  <IconButton
                    onClick={() => handleDeleteBug(selectedBug.id)}
                    icon={Trash2}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Delete Bug"
                  />
                </div>
                <div className="text-xs text-gray-500">
                  ID: {selectedBug.id}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kanban;
