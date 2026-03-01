'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Users, Plus, Edit2, Trash2, Search, Phone as PhoneIcon, Mail, MapPin, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';

interface Contact {
  contact_id: string;
  name: string;
  phone: string;
  email?: string;
  source: 'CALL' | 'MANUAL' | 'IMPORT';
  tags?: string[];
  notes?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  lead_status?: LeadStatus;
  created_at: string;
  total_calls?: number;
  last_contact_at?: string;
}

const LEAD_STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'NEW', label: 'New', color: 'bg-slate-100 text-slate-700' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-blue-100 text-blue-700' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-amber-100 text-amber-700' },
  { value: 'CONVERTED', label: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'LOST', label: 'Lost', color: 'bg-red-100 text-red-700' },
];

const leadStatusBadge = (status?: string) => {
  const s = LEAD_STATUSES.find((l) => l.value === status);
  return s
    ? { label: s.label, color: s.color }
    : { label: status || 'New', color: 'bg-slate-100 text-slate-700' };
};

const sourceColor = (source: string) => {
  switch (source) {
    case 'CALL': return 'bg-blue-100 text-blue-700';
    case 'MANUAL': return 'bg-purple-100 text-purple-700';
    case 'IMPORT': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const formatDate = (dateString?: string | number) => {
  if (!dateString) return 'Never';
  return new Date(typeof dateString === 'number' ? dateString : dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function ContactsPage() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [leadFilter, setLeadFilter] = useState<'ALL' | LeadStatus>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | string>('ALL');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    tags: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    lead_status: 'NEW' as LeadStatus,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.getContacts(500);
      setContacts(response.contacts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      void loadContacts();
      return;
    }
    try {
      setIsLoading(true);
      const results = await apiClient.searchContacts(searchQuery);
      setContacts(results?.contacts || results || []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (leadFilter !== 'ALL' && (c.lead_status || 'NEW') !== leadFilter) return false;
      if (sourceFilter !== 'ALL' && c.source !== sourceFilter) return false;
      return true;
    });
  }, [contacts, leadFilter, sourceFilter]);

  const stats = useMemo(() => {
    const total = contacts.length;
    const byStatus = LEAD_STATUSES.map((s) => ({
      ...s,
      count: contacts.filter((c) => (c.lead_status || 'NEW') === s.value).length,
    }));
    return { total, byStatus };
  }, [contacts]);

  const handleCreate = () => {
    setEditingContact(null);
    setFormData({ name: '', phone: '', email: '', notes: '', tags: '', address: '', city: '', state: '', zipcode: '', lead_status: 'NEW' });
    setIsDialogOpen(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      phone: contact.phone,
      email: contact.email || '',
      notes: contact.notes || '',
      tags: contact.tags?.join(', ') || '',
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zipcode: contact.zipcode || '',
      lead_status: contact.lead_status || 'NEW',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const tags = formData.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const data = {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        notes: formData.notes || undefined,
        tags,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zipcode: formData.zipcode || undefined,
        lead_status: formData.lead_status,
      };
      if (editingContact) {
        await apiClient.updateContact(editingContact.contact_id, data);
      } else {
        await apiClient.createContact(data);
      }
      setIsDialogOpen(false);
      void loadContacts();
      toast({ title: editingContact ? 'Contact updated' : 'Contact added', description: 'Your contact list is up to date.' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message || 'Failed to save contact', variant: 'destructive' });
    }
  };

  const quickUpdateStatus = async (contact: Contact, status: LeadStatus) => {
    try {
      await apiClient.updateContact(contact.contact_id, { lead_status: status });
      setContacts((prev) =>
        prev.map((c) => (c.contact_id === contact.contact_id ? { ...c, lead_status: status } : c)),
      );
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message || 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDeleteClick = (contact: Contact) => {
    setDeleteTarget(contact);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteContact(deleteTarget.contact_id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      void loadContacts();
      toast({ title: 'Contact deleted', description: 'The contact has been removed.' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message || 'Failed to delete contact', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const exportCsv = () => {
    const header = ['Name', 'Phone', 'Email', 'Source', 'Lead Status', 'Tags', 'Notes', 'Address', 'City', 'State', 'Zip', 'Total Calls', 'Added'];
    const rows = filtered.map((c) => [
      c.name, c.phone, c.email || '', c.source, c.lead_status || 'NEW',
      (c.tags || []).join('; '), c.notes || '',
      c.address || '', c.city || '', c.state || '', c.zipcode || '',
      String(c.total_calls || 0), formatDate(c.created_at),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `contacts-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
    let created = 0;
    let failed = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const row: Record<string, string> = {};
      header.forEach((h, idx) => { row[h] = cols[idx] || ''; });
      if (!row.name || !row.phone) { failed++; continue; }
      try {
        await apiClient.createContact({
          name: row.name,
          phone: row.phone,
          email: row.email || undefined,
          notes: row.notes || undefined,
          tags: row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [],
          address: row.address || undefined,
          city: row.city || undefined,
          state: row.state || undefined,
          zipcode: row.zip || row.zipcode || undefined,
          lead_status: (row['lead status'] || row.lead_status || 'NEW').toUpperCase(),
          source: 'IMPORT',
        });
        created++;
      } catch {
        failed++;
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    void loadContacts();
    toast({
      title: `Import complete`,
      description: `${created} contacts imported${failed > 0 ? `, ${failed} skipped` : ''}.`,
    });
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button onClick={() => void loadContacts()} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="CRM"
        title="Contacts & pipeline"
        subtitle="Manage every customer relationship, track lead status, and keep your pipeline moving."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <label className="cursor-pointer">
              <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                Import CSV
              </span>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => void importCsv(e)} />
            </label>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add contact
            </Button>
          </div>
        }
      />

      {/* Pipeline status summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.byStatus.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setLeadFilter(leadFilter === s.value ? 'ALL' : s.value)}
            className={`rounded-2xl border p-3 text-left transition shadow-sm ${
              leadFilter === s.value
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-100 bg-white hover:border-slate-200'
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{s.count}</p>
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          className="flex-1 min-w-[200px]"
        />
        <Button onClick={() => void handleSearch()}>
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
        >
          <option value="ALL">All sources</option>
          <option value="CALL">From calls</option>
          <option value="MANUAL">Manual</option>
          <option value="IMPORT">Imported</option>
        </select>
        {leadFilter !== 'ALL' && (
          <button
            type="button"
            onClick={() => setLeadFilter('ALL')}
            className="rounded-xl border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear filter ✕
          </button>
        )}
      </div>

      {/* Contacts list */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {filtered.length} of {contacts.length} contacts
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filtered.map((contact) => {
              const badge = leadStatusBadge(contact.lead_status);
              return (
                <div key={contact.contact_id} className="px-5 py-4 hover:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="h-9 w-9 flex-shrink-0 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">
                        {contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900 truncate">{contact.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sourceColor(contact.source)}`}>
                            {contact.source}
                          </span>
                          {(contact.tags || []).map((tag, idx) => (
                            <span key={idx} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <PhoneIcon className="h-3.5 w-3.5" /> {contact.phone}
                          </span>
                          {contact.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="h-3.5 w-3.5" /> {contact.email}
                            </span>
                          )}
                          {(contact.city || contact.zipcode) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {[contact.city, contact.state, contact.zipcode].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>

                        {contact.notes && (
                          <p className="mt-1 text-xs text-slate-400 truncate">{contact.notes}</p>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          {contact.total_calls !== undefined && contact.total_calls > 0 && (
                            <span>{contact.total_calls} call{contact.total_calls !== 1 ? 's' : ''}</span>
                          )}
                          <span>Added {formatDate(contact.created_at)}</span>
                          {contact.last_contact_at && (
                            <span>Last contact {formatDate(contact.last_contact_at)}</span>
                          )}
                        </div>

                        {/* Quick lead status update */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {LEAD_STATUSES.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => void quickUpdateStatus(contact, s.value)}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium transition border ${
                                (contact.lead_status || 'NEW') === s.value
                                  ? `${s.color} border-transparent`
                                  : 'border-slate-200 text-slate-400 hover:border-slate-300'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(contact)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(contact)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No contacts"
              description={
                leadFilter !== 'ALL'
                  ? `No contacts with status "${leadFilter}".`
                  : 'Contacts are created automatically from calls, or add them manually.'
              }
              action={
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add contact
                </Button>
              }
            />
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit contact' : 'Add contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="jane@example.com"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="lead_status">Lead status</Label>
              <select
                id="lead_status"
                value={formData.lead_status}
                onChange={(e) => setFormData({ ...formData, lead_status: e.target.value as LeadStatus })}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main St"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Austin"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="TX"
                />
              </div>
              <div>
                <Label htmlFor="zipcode">ZIP</Label>
                <Input
                  id="zipcode"
                  value={formData.zipcode}
                  onChange={(e) => setFormData({ ...formData, zipcode: e.target.value })}
                  placeholder="78701"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="vip, repeat, urgent"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Any details about this contact…"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={!formData.name || !formData.phone}>
                {editingContact ? 'Save changes' : 'Add contact'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete contact</DialogTitle>
            <DialogDescription>
              This will permanently remove {deleteTarget?.name ?? 'this contact'} from your list. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
