import{ useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useBugs } from '../context/BugContext';
import { useProjects } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { useTeams } from '../context/TeamContext';
import { getAllUsers } from '../services/userService';
import type { AppUser } from '../types/auth';
import Navigation from '../components/layout/Navigation';
// import BugForm from '../components/dashboard/BugForm';
import BugFilters from '../components/bugs/BugFilters';
import BugTable from '../components/bugs/BugTable';
import BreadcrumbNew from '../components/common/BreadcrumbNew';
import Loading from '../components/common/Loading';
import { Plus, RefreshCw } from 'lucide-react';
import { Button, IconButton } from '../components/common/buttons';
import type { BugFilters as BugFiltersType, BugStatus, BugPriority, Bug } from '../types/bugs';

const Bugs = () => {
  const { bugs, loading, updateBug, deleteBug, refreshBugs } = useBugs();
  const { projects } = useProjects();
  const { user } = useAuth();
  const { teams } = useTeams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');

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
  const [filters, setFilters] = useState<BugFiltersType>({});
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const bugsPerPage = 15;

  // Load users for slug conversion
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

  // Helper functions for slug conversion
  const createUserSlug = (user: AppUser) => {
    const slug = user.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug;
  };

  const findUserBySlug = useCallback((slug: string) => {
    return allUsers.find(user => createUserSlug(user) === slug);
  }, [allUsers]);

  const findUserById = (userId: string) => {
    return allUsers.find(user => user.id === userId);
  };

  // Initialize filters and search from URL parameters
  useEffect(() => {
    // Only process URL parameters after users are loaded
    if (allUsers.length === 0) return;

    const urlSearch = searchParams.get('search') || '';
    const urlStatus = searchParams.get('status');
    const urlPriority = searchParams.get('priority');
    const urlAssignee = searchParams.get('assignee');
    const urlProject = searchParams.get('project');
    const urlStartDate = searchParams.get('startDate');
    const urlEndDate = searchParams.get('endDate');

    setSearchTerm(urlSearch);

    const urlFilters: BugFiltersType = {};
    if (urlStatus) urlFilters.status = [urlStatus as BugStatus];
    if (urlPriority) urlFilters.priority = [urlPriority as BugPriority];
    if (urlAssignee) {
      // Convert slug back to user ID
      const user = findUserBySlug(urlAssignee);
      if (user) {
        urlFilters.assignee = user.id;
      }
    }
    if (urlProject) {
      // Decode URL-encoded project parameter
      const decodedProject = decodeURIComponent(urlProject);
      // Convert project slug to project name
      const project = projects.find(p => p.slug === decodedProject);
      if (project) {
        urlFilters.projectName = project.name;
      } else {
        // Fallback to the decoded value if no project found
        urlFilters.projectName = decodedProject;
      }
    }
    if (urlStartDate || urlEndDate) {
      urlFilters.dateRange = {};
      if (urlStartDate) {
        urlFilters.dateRange.start = new Date(urlStartDate);
      }
      if (urlEndDate) {
        urlFilters.dateRange.end = new Date(urlEndDate);
      }
    }

    setFilters(urlFilters);
  }, [searchParams, allUsers, findUserBySlug, projects]);

  // Update URL when filters change
  const updateURL = (newFilters: BugFiltersType, newSearch: string) => {
    const params = new URLSearchParams();
    
    if (newSearch) params.set('search', newSearch);
    if (newFilters.status?.[0]) params.set('status', newFilters.status[0]);
    if (newFilters.priority?.[0]) params.set('priority', newFilters.priority[0]);
    if (newFilters.assignee) {
      // Convert user ID to slug
      const user = findUserById(newFilters.assignee);
      if (user) {
        const slug = createUserSlug(user);
        params.set('assignee', slug);
      }
    }
    if (newFilters.projectName) {
      // Convert project name to slug for URL
      const project = projects.find(p => p.name === newFilters.projectName);
      if (project) {
        params.set('project', project.slug);
      } else {
        params.set('project', newFilters.projectName);
      }
    }
    if (newFilters.dateRange?.start) params.set('startDate', newFilters.dateRange.start.toISOString().split('T')[0]);
    if (newFilters.dateRange?.end) params.set('endDate', newFilters.dateRange.end.toISOString().split('T')[0]);

    setSearchParams(params);
  };

  // Exclude bugs whose project is on hold or discontinued
  const activeProjectIds = useMemo(() => new Set(
    projects
      .filter(p => p.status !== 'on_hold' && p.status !== 'discontinued')
      .map(p => p.id)
  ), [projects]);

  // Remove duplicates first, then filter bugs based on active projects, search and filters
  const filteredBugs = useMemo((): Bug[] => {
    const uniqueBugs = bugs.filter((bug, index, self) => 
      index === self.findIndex(b => b.id === bug.id && b.projectId === bug.projectId)
    );
    
    return uniqueBugs.filter(bug => {
    // Project status filter: hide if project is on hold or discontinued
    if (bug.projectId && !activeProjectIds.has(bug.projectId)) {
      return false;
    }

    // Search filter - search in title, description, ID, assignee names, and project name
    const matchesSearch = searchTerm === '' || 
      bug.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bug.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bug.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bug.assigneeName && bug.assigneeName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (bug.externalAssigneeName && bug.externalAssigneeName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (bug.projectName && bug.projectName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (bug.labels && bug.labels.some(label => label.toLowerCase().includes(searchTerm.toLowerCase())));

    // Status filter
    const matchesStatus = !filters.status || filters.status.length === 0 || 
      filters.status.includes(bug.status);

    // Priority filter
    const matchesPriority = !filters.priority || filters.priority.length === 0 || 
      filters.priority.includes(bug.priority);

    // Assignee filter - check both assignee and externalAssignee by ID
    const matchesAssignee = !filters.assignee || 
      bug.assignee === filters.assignee ||
      bug.externalAssignee === filters.assignee;

    // Date range filter
    const matchesDateRange = !filters.dateRange || 
      (!filters.dateRange.start || bug.createdAt >= filters.dateRange.start) &&
      (!filters.dateRange.end || bug.createdAt <= filters.dateRange.end);

    // Project filter
    const matchesProject = !filters.projectName || bug.projectName === filters.projectName;

    return matchesSearch && matchesStatus && matchesPriority && 
           matchesAssignee && matchesDateRange && matchesProject;
    });
  }, [bugs, activeProjectIds, searchTerm, filters]);

  // Pagination logic
  const totalBugs = filteredBugs.length;
  const totalPages = Math.ceil(totalBugs / bugsPerPage);
  const startIndex = (currentPage - 1) * bugsPerPage;
  const endIndex = startIndex + bugsPerPage;
  const paginatedBugs = filteredBugs.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  const handleStatusChange = async (bugId: string, status: string) => {
    try {
      await updateBug(bugId, { status: status as BugStatus });
    } catch (error) {
      console.error('Error updating bug status:', error);
    }
  };

  const handlePriorityChange = async (bugId: string, priority: string) => {
    try {
      await updateBug(bugId, { priority: priority as BugPriority });
    } catch (error) {
      console.error('Error updating bug priority:', error);
    }
  };

  const handleDeleteBug = async (bugId: string) => {
    if (!confirm('Are you sure you want to delete this bug? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteBug(bugId);
    } catch (error) {
      console.error('Error deleting bug:', error);
      alert('Failed to delete bug');
    }
  };

  const handleBulkDelete = async (bugIds: string[]) => {
    if (!confirm(`Are you sure you want to delete ${bugIds.length} bugs? This action cannot be undone.`)) {
      return;
    }

    try {
      await Promise.all(bugIds.map(bugId => deleteBug(bugId)));
    } catch (error) {
      console.error('Error bulk deleting bugs:', error);
      alert('Failed to delete some bugs');
    }
  };


  const handleRefresh = () => {
    refreshBugs();
  };

  const handleEditBug = (bug: Bug) => {
    // Remove # from bug ID if present
    const cleanBugId = bug.id.replace('#', '');
    navigate(`/bugs/${cleanBugId}/edit`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading bugs..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <BreadcrumbNew 
          items={[
            { label: 'Bugs' }
          ]}
          showBackButton={false}
        />

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Bugs</h1>
              <p className="text-gray-600">
                Track and manage all your bug reports in one place.
              </p>
            </div>
            <div className="flex items-center space-x-3 mt-4 sm:mt-0">
              <IconButton
                onClick={handleRefresh}
                icon={RefreshCw}
                variant="ghost"
                size="sm"
                title="Refresh bugs"
              />
              {canCreateBug && (
                <Button
                  onClick={() => navigate('/bugs/add')}
                  variant="primary"
                  icon={Plus}
                >
                  New Bug
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <BugFilters
          filters={filters}
          onFiltersChange={(newFilters) => {
            setFilters(newFilters);
            updateURL(newFilters, searchTerm);
          }}
          onSearchChange={(newSearch) => {
            setSearchTerm(newSearch);
            updateURL(filters, newSearch);
          }}
          onClearFilters={() => {
            setFilters({});
            setSearchTerm('');
            updateURL({}, '');
          }}
          searchTerm={searchTerm}
          projects={projects.map(p => ({ id: p.id, name: p.name }))}
        />

        {/* Bugs Count */}
        <div className="flex items-center justify-end mb-4">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(endIndex, totalBugs)} of {totalBugs} bugs
          </div>
        </div>

        {/* Bugs Table */}
        <BugTable
          bugs={paginatedBugs}
          onDeleteBug={handleDeleteBug}
          onBulkDelete={handleBulkDelete}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onEditBug={handleEditBug}
          loading={loading}
        />

        {/* Pagination Controls - Bottom Left */}
        {totalPages > 1 && (
          <div className="flex items-center justify-start mt-6">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>


      </div>
    );
  };

export default Bugs; 