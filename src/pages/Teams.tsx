import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeams } from '../context/TeamContext';
import { useBugs } from '../context/BugContext';
import { useProjects } from '../context/ProjectContext';
import type { Team, CreateTeamData } from '../types/auth';
import Navigation from '../components/layout/Navigation';
import BreadcrumbNew from '../components/common/BreadcrumbNew';
import Loading from '../components/common/Loading';
import TeamModal from '../components/projects/TeamModal';
import { TeamCard } from '../components/common';
import { getUserNamesByIds, getUserDetailsByIds } from '../services/userService';
import { projectService } from '../services/projectService';
import { 
  Users, 
  Plus, 
  Search, 
  Filter,
  BarChart3
} from 'lucide-react';
import { Button } from '../components/common/buttons';

const Teams = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { teams, loading: teamsLoading, updateTeam, createTeam } = useTeams();
  const { bugs } = useBugs();
  const { projects } = useProjects();
  const [searchTerm, setSearchTerm] = useState('');
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamModalMode, setTeamModalMode] = useState<'create' | 'edit'>('create');
  const [managerNames, setManagerNames] = useState<Record<string, string>>({});
  const [teamLeadNames, setTeamLeadNames] = useState<Record<string, string>>({});
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [memberDetails, setMemberDetails] = useState<Record<string, { name: string; role: string }>>({});

  // Check if user can manage teams
  const canManageTeams = user?.role === 'super_admin' || user?.role === 'manager';


  // Filter teams based on user role
  const filteredTeams = teams.filter(team => {
    // Super admin can see all teams
    if (user?.role === 'super_admin') {
      return true;
    }
    
    // Manager can only see teams they manage
    if (user?.role === 'manager') {
      return team.managerId === user.id;
    }
    
    // Other roles cannot access this page (handled by route protection)
    return false;
  });

  // Filter teams based on search term
  const searchFilteredTeams = filteredTeams.filter(team =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    team.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  // Fetch manager, team lead names, and member details for display
  useEffect(() => {
    const fetchNames = async () => {
      if (searchFilteredTeams.length > 0) {
        const managerIds = searchFilteredTeams.map(team => team.managerId).filter((id): id is string => Boolean(id));
        const teamLeadIds = searchFilteredTeams.flatMap(team => team.teamLeadIds || []).filter((id): id is string => Boolean(id));
        
        // Get all unique member IDs from filtered teams
        const allMemberIds = searchFilteredTeams.reduce((acc: string[], team) => {
          if (team.members && Array.isArray(team.members)) {
            acc.push(...team.members);
          }
          return acc;
        }, []);
        const uniqueMemberIds = [...new Set(allMemberIds)];
        
        const managerNames = await getUserNamesByIds(managerIds);
        const teamLeadNames = await getUserNamesByIds(teamLeadIds);
        const memberDetails = await getUserDetailsByIds(uniqueMemberIds);
        
        setManagerNames(managerNames);
        setTeamLeadNames(teamLeadNames);
        setMemberDetails(memberDetails);
      }
    };

    fetchNames();
  }, [searchFilteredTeams]); // Use useMemo to stabilize the array reference

  // Fetch project counts for each team
  useEffect(() => {
    const fetchProjectCounts = async () => {
      const counts: Record<string, number> = {};
      for (const team of searchFilteredTeams) {
        try {
          const teamProjects = await projectService.getProjectsByTeam(team.id);
          counts[team.id] = teamProjects.length;
        } catch {
          counts[team.id] = 0;
        }
      }
      setProjectCounts(counts);
    };

    if (searchFilteredTeams.length > 0) {
      fetchProjectCounts();
    }
  }, [searchFilteredTeams]); // Use useMemo to stabilize the array reference

  const handleCreateTeam = () => {
    setTeamModalMode('create');
    setSelectedTeam(null);
    setTeamModalOpen(true);
  };

  const handleEditTeam = (team: Team) => {
    setTeamModalMode('edit');
    setSelectedTeam(team);
    setTeamModalOpen(true);
  };

  const handleViewTeam = (team: Team) => {
    if (team.slug) {
      navigate(`/t/${team.slug}`);
    } else {
      navigate(`/teams/${encodeURIComponent(team.id)}`);
    }
  };


  const handleSaveTeam = async (teamData: CreateTeamData) => {
    try {
      if (teamModalMode === 'create') {
        await createTeam(teamData);
        console.log('Team created successfully:', teamData);
      } else {
        if (selectedTeam) {
          await updateTeam(selectedTeam.id, teamData);
        }
      }
      setTeamModalOpen(false);
    } catch (error) {
      console.error('Error saving team:', error);
      alert('Failed to save team');
    }
  };

  if (teamsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading teams..." />
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
            { label: 'Teams' }
          ]}
          showBackButton={false}
        />

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Teams</h1>
              <p className="text-gray-600">
                {user?.role === 'super_admin' 
                  ? 'Manage all teams and their members across the organization.'
                  : 'Manage your teams and their members.'
                }
              </p>
            </div>
            {canManageTeams && (
              <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                <Button
                  onClick={handleCreateTeam}
                  variant="primary"
                  icon={Plus}
                >
                  Create Team
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                icon={Filter}
                size="sm"
              >
                Filter
              </Button>
            </div>
          </div>
        </div>

        {/* Teams Count */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-gray-600">
            Showing {searchFilteredTeams.length} of {filteredTeams.length} teams
          </div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">Team Analytics</span>
          </div>
        </div>

        {/* Teams Grid */}
        {searchFilteredTeams.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {searchFilteredTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                managerName={managerNames[team.managerId]}
                teamLeadNames={team.teamLeadIds ? team.teamLeadIds.map(id => teamLeadNames[id]).filter(Boolean) : []}
                projectCount={projectCounts[team.id] || 0}
                totalBugs={bugs.filter(b => b.projectId && projects.find(p => p.id === b.projectId)?.teamId === team.id).length}
                bugsResolved={bugs.filter(b => b.projectId && projects.find(p => p.id === b.projectId)?.teamId === team.id && b.status === 'completed').length}
                memberDetails={memberDetails}
                onView={handleViewTeam}
                onEdit={canManageTeams ? handleEditTeam : undefined}
                variant="default"
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No teams found</h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? 'No teams match your search criteria.'
                : user?.role === 'super_admin'
                  ? 'Get started by creating your first team.'
                  : 'You are not managing any teams yet.'
              }
            </p>
            {canManageTeams && !searchTerm && (
              <Button
                onClick={handleCreateTeam}
                variant="primary"
                icon={Plus}
                size="lg"
              >
                Create First Team
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Team Modal */}
      <TeamModal
        isOpen={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        onSave={handleSaveTeam}
        team={selectedTeam || undefined}
        mode={teamModalMode}
      />
    </div>
  );
};

export default Teams;
