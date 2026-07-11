import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjects } from '../context/ProjectContext';
import { useTeams } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { getAllUsers } from '../services/userService';
import Navigation from '../components/layout/Navigation';
import BreadcrumbNew from '../components/common/BreadcrumbNew';
import Loading from '../components/common/Loading';
import { 
  ArrowLeft,
  Save,
  X,
  AlertCircle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Button, IconButton } from '../components/common/buttons';
import MarkdownEditor from '../components/common/MarkdownEditor';
import type { Project, ProjectSettings, ProjectDetail } from '../types/projects';

const ProjectEdit = () => {
  const { projectId: rawProjectId, slug } = useParams<{ projectId?: string; slug?: string }>();
  
  // Decode the projectId if it was URL encoded
  const projectId = rawProjectId ? decodeURIComponent(rawProjectId) : undefined;
  const navigate = useNavigate();
  const { projects, updateProject } = useProjects();
  const { teams } = useTeams();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    shortDescription: '',
    description: '',
    status: 'active' as Project['status'],
    teamIds: [] as string[],
    teamLeadIds: [] as string[],
    startDate: '',
    expectedEndDate: '',
    duration: '',
    technologyStack: [] as string[],
    developmentEnvironment: [] as string[],
    settings: {
      allowPublicAccess: false,
      requireApproval: false,
      autoAssign: false,
      customFields: []
    } as ProjectSettings
  });
  
  const [details, setDetails] = useState<ProjectDetail[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableTeams, setAvailableTeams] = useState(teams);
  const [availableTeamLeads, setAvailableTeamLeads] = useState<any[]>([]);
  const [teamLeadNames, setTeamLeadNames] = useState<{[key: string]: string}>({});

  // Role-based permissions
  const canEditProjects = user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'team_lead';

  // Find project by ID or slug
  useEffect(() => {
    const findProject = () => {
      let foundProject = null;
      
      if (projectId) {
        foundProject = projects.find(p => p.id === projectId);
      } else if (slug) {
        foundProject = projects.find(p => p.slug === slug);
      }
      
      if (foundProject) {
        setProject(foundProject);
        // Handle both legacy teamId and new teamIds array
        const teamIds = foundProject.teamIds || (foundProject.teamId ? [foundProject.teamId] : []);
        setFormData({
          name: foundProject.name,
          shortDescription: foundProject.shortDescription || '',
          description: foundProject.description,
          status: foundProject.status,
          teamIds: teamIds,
          teamLeadIds: foundProject.teamLeadIds || [],
          startDate: foundProject.startDate ? new Date(foundProject.startDate).toISOString().split('T')[0] : '',
          expectedEndDate: foundProject.expectedEndDate ? new Date(foundProject.expectedEndDate).toISOString().split('T')[0] : '',
          duration: foundProject.duration || '',
          technologyStack: foundProject.technologyStack || [],
          developmentEnvironment: foundProject.developmentEnvironment || [],
          settings: foundProject.settings
        });
        setDetails(foundProject.details || []);
      }
      
      setLoading(false);
    };

    if (projects.length > 0) {
      findProject();
    } else if (projectId || slug) {
      // If we have a projectId or slug but no projects loaded yet, wait
    }
  }, [projectId, slug, projects]);

  useEffect(() => {
    setAvailableTeams(teams);
  }, [teams]);

  // Load team lead names for display
  useEffect(() => {
    const loadTeamLeadNames = async () => {
      try {
        const users = await getAllUsers();
        const namesMap: {[key: string]: string} = {};
        users.forEach(user => {
          namesMap[user.id] = user.name;
        });
        setTeamLeadNames(namesMap);
      } catch (error) {
        console.error('Error loading team lead names:', error);
      }
    };
    
    loadTeamLeadNames();
  }, []);

  const handleTeamToggle = (teamId: string) => {
    setFormData(prev => ({
      ...prev,
      teamIds: prev.teamIds.includes(teamId)
        ? prev.teamIds.filter(id => id !== teamId)
        : [...prev.teamIds, teamId]
    }));
  };

  // Update available team leads when team selection changes
  useEffect(() => {
    if (formData.teamIds && formData.teamIds.length > 0) {
      // Get all team leads from all selected teams
      const allTeamLeadIds = new Set<string>();
      formData.teamIds.forEach(teamId => {
        const selectedTeam = teams.find(team => team.id === teamId);
        if (selectedTeam && selectedTeam.teamLeadIds) {
          selectedTeam.teamLeadIds.forEach(leadId => allTeamLeadIds.add(leadId));
        }
      });
      
      const teamLeads = Array.from(allTeamLeadIds).map(leadId => ({
        id: leadId,
        name: teamLeadNames[leadId] || 'Unknown'
      }));
      
      setAvailableTeamLeads(teamLeads);
      
      // Auto-select if there's only one team lead and no current selection
      if (teamLeads.length === 1 && formData.teamLeadIds.length === 0) {
        setFormData(prev => ({
          ...prev,
          teamLeadIds: [teamLeads[0].id]
        }));
      } else if (formData.teamLeadIds.length > 0) {
        // Remove team leads that are no longer in selected teams
        const validTeamLeadIds = formData.teamLeadIds.filter(id => allTeamLeadIds.has(id));
        if (validTeamLeadIds.length !== formData.teamLeadIds.length) {
          setFormData(prev => ({
            ...prev,
            teamLeadIds: validTeamLeadIds
          }));
        }
      }
    } else {
      setAvailableTeamLeads([]);
      setFormData(prev => ({
        ...prev,
        teamLeadIds: []
      }));
    }
  }, [formData.teamIds, teams, teamLeadNames]);

  const handleChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof typeof prev] as any),
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleTeamLeadToggle = (teamLeadId: string) => {
    setFormData(prev => ({
      ...prev,
      teamLeadIds: prev.teamLeadIds.includes(teamLeadId)
        ? prev.teamLeadIds.filter(id => id !== teamLeadId)
        : [...prev.teamLeadIds, teamLeadId]
    }));
  };

  // Detail management functions
  const addDetail = () => {
    const newDetail: ProjectDetail = {
      id: `detail-${Date.now()}`,
      title: '',
      content: '',
      order: details.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setDetails(prev => [...prev, newDetail]);
  };

  const updateDetail = (id: string, field: 'title' | 'content', value: string) => {
    setDetails(prev => prev.map(detail => 
      detail.id === id 
        ? { ...detail, [field]: value, updatedAt: new Date() }
        : detail
    ));
  };

  const deleteDetail = (id: string) => {
    setDetails(prev => {
      const filtered = prev.filter(detail => detail.id !== id);
      // Reorder remaining details
      return filtered.map((detail, index) => ({
        ...detail,
        order: index
      }));
    });
  };

  const moveDetailUp = (id: string) => {
    setDetails(prev => {
      const index = prev.findIndex(detail => detail.id === id);
      if (index <= 0) return prev;
      
      const newDetails = [...prev];
      [newDetails[index - 1], newDetails[index]] = [newDetails[index], newDetails[index - 1]];
      
      // Update order
      return newDetails.map((detail, idx) => ({
        ...detail,
        order: idx
      }));
    });
  };

  const moveDetailDown = (id: string) => {
    setDetails(prev => {
      const index = prev.findIndex(detail => detail.id === id);
      if (index >= prev.length - 1) return prev;
      
      const newDetails = [...prev];
      [newDetails[index], newDetails[index + 1]] = [newDetails[index + 1], newDetails[index]];
      
      // Update order
      return newDetails.map((detail, idx) => ({
        ...detail,
        order: idx
      }));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditProjects || !project) {
      setError('You do not have permission to edit this project');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const projectData = {
        ...formData,
        details: details,
        settings: formData.settings,
        // Convert date strings to Date objects
        startDate: formData.startDate ? new Date(formData.startDate) : undefined,
        expectedEndDate: formData.expectedEndDate ? new Date(formData.expectedEndDate) : undefined,
        // Ensure arrays are properly set
        technologyStack: formData.technologyStack || [],
        developmentEnvironment: formData.developmentEnvironment || []
      };


      await updateProject(project.id, projectData);
      navigate(`/projects/${encodeURIComponent(project.id)}/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading project details..." />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading />
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
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
            <p className="text-gray-600 mb-6">The project you're looking for doesn't exist.</p>
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

  if (!canEditProjects) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">You don't have permission to edit this project.</p>
            <Button
              onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/preview`)}
              variant="primary"
              icon={ArrowLeft}
            >
              Back to Project
            </Button>
          </div>
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
            { label: 'Projects', href: '/projects' },
            { label: project.name, href: `/p/${project.slug}/preview` },
            { label: 'Edit' }
          ]}
          showBackButton={false}
        />

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Edit Project</h1>
                <p className="text-gray-600 mt-1">Update project details and settings</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/preview`)}
                  variant="outline"
                  icon={X}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !formData.name.trim()}
                  variant="primary"
                  icon={Save}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Main Content */}
          <div className="space-y-6">
            {/* Basic Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
            </div>
            <div className="px-6 py-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter project name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Short Description
                </label>
                <input
                  type="text"
                  value={formData.shortDescription || ''}
                  onChange={(e) => handleChange('shortDescription', e.target.value)}
                  placeholder="Brief description of the project"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <MarkdownEditor
                  value={formData.description}
                  onChange={(value) => handleChange('description', value)}
                  placeholder="Describe the project goals and objectives"
                />
              </div>

              {/* Additional Details Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Additional Details
                  </label>
                </div>
                
                {details.map((detail, index) => (
                  <div key={detail.id} className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={detail.title}
                          onChange={(e) => updateDetail(detail.id, 'title', e.target.value)}
                          placeholder="Detail title (e.g., Technical Specs, Requirements)"
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 text-sm font-medium"
                        />
                      </div>
                      <div className="flex items-center space-x-1">
                        <IconButton
                          onClick={() => moveDetailUp(detail.id)}
                          variant="ghost"
                          size="sm"
                          icon={ChevronUp}
                          disabled={index === 0}
                          title="Move up"
                        />
                        <IconButton
                          onClick={() => moveDetailDown(detail.id)}
                          variant="ghost"
                          size="sm"
                          icon={ChevronDown}
                          disabled={index === details.length - 1}
                          title="Move down"
                        />
                        <IconButton
                          onClick={() => deleteDetail(detail.id)}
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          className="text-red-600 hover:text-red-700"
                          title="Delete"
                        />
                      </div>
                    </div>
                    <MarkdownEditor
                      value={detail.content}
                      onChange={(value) => updateDetail(detail.id, 'content', value)}
                      placeholder="Add detailed information for this section..."
                      className="min-h-[200px]"
                    />
                  </div>
                ))}
                
                {/* Add Additional File Button - Always at bottom */}
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={addDetail}
                    variant="outline"
                    size="sm"
                    icon={Plus}
                  >
                    Add Additional File
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_hold">On Hold</option>
                  <option value="discontinued">Discontinued</option>
                  <option value="complete">Complete</option>
                </select>
              </div>

              {/* Team Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assigned Teams
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 rounded-lg p-3">
                  {availableTeams.length === 0 ? (
                    <p className="text-sm text-gray-500">No teams available</p>
                  ) : (
                    availableTeams.map((team) => (
                      <label key={team.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.teamIds.includes(team.id)}
                          onChange={() => handleTeamToggle(team.id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary/20"
                        />
                        <span className="text-sm text-gray-700">
                          {team.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {formData.teamIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {formData.teamIds.length} team(s)
                  </p>
                )}
              </div>

              {/* Team Lead Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Leads
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 rounded-lg p-3">
                  {availableTeamLeads.length === 0 ? (
                    <p className="text-sm text-gray-500">No team leads available</p>
                  ) : (
                    availableTeamLeads.map((teamLead) => (
                      <label key={teamLead.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.teamLeadIds.includes(teamLead.id)}
                          onChange={() => handleTeamLeadToggle(teamLead.id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary/20"
                        />
                        <span className="text-sm text-gray-700">
                          {teamLead.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {formData.teamLeadIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {formData.teamLeadIds.length} team lead(s)
                  </p>
                )}
              </div>

              {/* Project Timeline Section */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Project Timeline</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleChange('startDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Expected End Date
                    </label>
                    <input
                      type="date"
                      value={formData.expectedEndDate}
                      onChange={(e) => handleChange('expectedEndDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duration
                    </label>
                    <input
                      type="text"
                      value={formData.duration}
                      onChange={(e) => handleChange('duration', e.target.value)}
                      placeholder="e.g., 2.5 months"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Technical Details Section */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Technical Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Technology Stack
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Add technology and press enter"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const value = e.currentTarget.value.trim();
                            if (value && !formData.technologyStack.includes(value)) {
                              console.log('Adding technology:', value);
                              console.log('Current stack:', formData.technologyStack);
                              handleChange('technologyStack', [...formData.technologyStack, value]);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        {formData.technologyStack.map((tech, index) => (
                          <span
                            key={index}
                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm flex items-center gap-1"
                          >
                            {tech}
                            <button
                              type="button"
                              onClick={() => {
                                const newStack = formData.technologyStack.filter((_, i) => i !== index);
                                handleChange('technologyStack', newStack);
                              }}
                              className="ml-1 text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Development Environment
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Add environment and press enter"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const value = e.currentTarget.value.trim();
                            if (value && !formData.developmentEnvironment.includes(value)) {
                              console.log('Adding environment:', value);
                              console.log('Current environment:', formData.developmentEnvironment);
                              handleChange('developmentEnvironment', [...formData.developmentEnvironment, value]);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        {formData.developmentEnvironment.map((env, index) => (
                          <span
                            key={index}
                            className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm flex items-center gap-1"
                          >
                            {env}
                            <button
                              type="button"
                              onClick={() => {
                                const newEnv = formData.developmentEnvironment.filter((_, i) => i !== index);
                                handleChange('developmentEnvironment', newEnv);
                              }}
                              className="ml-1 text-green-600 hover:text-green-800"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          </div>

        </form>
      </div>
    </div>
  );
};

export default ProjectEdit;
