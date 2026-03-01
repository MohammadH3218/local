'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CreateCompanyDialog } from '@/components/admin/create-company-dialog';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Plus, Search, Building2, Trash2, Edit } from 'lucide-react';
import { UserRole } from '@handycall/shared';
import { useAdminCompanyStore } from '@/stores/admin-company-store';

interface Company {
  company_id: string;
  company_name: string;
  service_type: string;
  status: string;
  phone_number?: string;
  email: string;
  timezone: string;
  created_at: number;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_tier?: string;
  cancel_at_period_end?: boolean;
}

export default function CompaniesPage() {
  const router = useRouter();
  const { userRole, isAuthenticated, isLoading } = useAuthStore();
  const { toast } = useToast();
  const { setCompany } = useAdminCompanyStore();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || userRole !== UserRole.ADMIN)) {
      router.push('/admin/login');
      return;
    }

    if (isAuthenticated && userRole === UserRole.ADMIN) {
      loadCompanies();
    }
  }, [isAuthenticated, userRole, isLoading, router]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = companies.filter(
        (company) =>
          company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          company.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCompanies(filtered);
    } else {
      setFilteredCompanies(companies);
    }
  }, [searchTerm, companies]);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/proxy/companies`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load companies');
      }

      const data = await response.json();
      setCompanies(data);
      setFilteredCompanies(data);
    } catch (error) {
      console.error('Failed to load companies:', error);
      toast({
        title: 'Error',
        description: 'Failed to load companies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;

    try {
      const response = await fetch(`/api/proxy/companies/${selectedCompany.company_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete company');
      }

      toast({
        title: 'Success',
        description: 'Company deleted successfully',
      });

      loadCompanies();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete company',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'TRIAL':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'CANCELLED':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'SUSPENDED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const formatCompanyStatus = (status: string) => {
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  const formatSubscriptionStatus = (status?: string, isCanceling?: boolean) => {
    if (isCanceling) return 'Cancelled';
    if (!status) return '';
    const normalized = status.toUpperCase();
    if (normalized === 'TRIALING') return 'Trial';
    if (normalized === 'ACTIVE') return 'Active';
    if (normalized === 'CANCELED' || normalized === 'CANCELLED') return 'Cancelled';
    return normalized.charAt(0) + normalized.slice(1).toLowerCase().replace('_', ' ');
  };

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="Admin"
        title="All companies"
        subtitle={`${filteredCompanies.length} ${filteredCompanies.length === 1 ? 'company' : 'companies'}`}
        actions={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        }
      />

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {filteredCompanies.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-10 w-10" />}
            title="No companies found"
            description={searchTerm ? 'Try a different search term.' : 'Get started by creating your first company.'}
            action={
              !searchTerm ? (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Company
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCompanies.map((company) => (
              <Card
                key={company.company_id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  setCompany(company.company_id, company.company_name);
                  router.push(`/admin/companies/${company.company_id}`);
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="truncate">{company.company_name}</CardTitle>
                      <CardDescription className="mt-1">{company.service_type.replace('_', ' ')}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(company.status)}>{formatCompanyStatus(company.status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="truncate ml-2" title={company.email}>
                        {company.email}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span>{company.phone_number || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span>{formatDate(company.created_at)}</span>
                    </div>
                    {(company.subscription_plan || company.subscription_tier) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Plan:</span>
                        <Badge variant="outline">
                          {company.subscription_plan || company.subscription_tier}
                          {company.subscription_status || company.cancel_at_period_end
                            ? ` - ${formatSubscriptionStatus(company.subscription_status, company.cancel_at_period_end)}`
                            : ''}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompany(company.company_id, company.company_name);
                        router.push(`/admin/companies/${company.company_id}`);
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCompany(company);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      
      <CreateCompanyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={loadCompanies}
      />

      {selectedCompany && (
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteCompany}
          title="Delete Company"
          description={`This will permanently delete "${selectedCompany.company_name}" and all associated data including users, calls, contacts, and knowledge base.`}
          confirmText={selectedCompany.company_name}
          itemName={selectedCompany.company_name}
          warningMessage="This action cannot be undone. All data will be permanently deleted."
        />
      )}
    </div>
  );
}
