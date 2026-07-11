import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProjects } from '../context/ProjectContext';
import { useTeams } from '../context/TeamContext';
import Navigation from '../components/layout/Navigation';
import BreadcrumbNew from '../components/common/BreadcrumbNew';
import BugForm from '../components/dashboard/BugForm';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/buttons';

const BugAdd = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects } = useProjects();
  const { teams } = useTeams();

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

  if (!canCreateBug) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-6">You don't have permission to create bugs.</p>
            <Button
              onClick={() => navigate('/bugs')}
              variant="primary"
              icon={ArrowLeft}
            >
              Back to Bugs
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    // Bug has been successfully created by BugForm
    // Navigate back to bugs page
    navigate('/bugs');
  };

  const handleCancel = () => {
    navigate('/bugs');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <BreadcrumbNew 
          items={[
            { label: 'Bugs', href: '/bugs' },
            { label: 'Add Bug' }
          ]}
          showBackButton={false}
        />

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Add New Bug</h1>
              <p className="text-gray-600 mt-2">Create a new bug report for tracking and resolution</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleCancel}
                variant="outline"
                icon={ArrowLeft}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>

        {/* Bug Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <BugForm
            bug={null}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={false}
            projects={projects}
            user={user}
          />
        </div>
      </div>
    </div>
  );
};

export default BugAdd;
