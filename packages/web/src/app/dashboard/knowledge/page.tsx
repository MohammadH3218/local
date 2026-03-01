'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Plus, Edit2, Trash2, X, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ServiceAreaTab } from './service-area-tab';
import { useToast } from '@/hooks/use-toast';

interface KnowledgeItem {
  knowledge_id: string;
  title: string;
  content: string;
  type: 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags?: string[];
  created_at: number;
  updated_at: number;
}

export default function KnowledgePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'knowledge' | 'service-area'>('knowledge');

  // Knowledge Items State
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    type: 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY';
    tags: string;
  }>({
    title: '',
    content: '',
    type: 'FAQ',
    tags: '',
  });

  useEffect(() => {
    if (activeTab === 'knowledge') {
      loadItems();
    }
  }, [activeTab]);

  const loadItems = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await apiClient.getKnowledgeItems();
      setItems(data || []);
    } catch (err: any) {
      console.error('Error loading knowledge items:', err);
      setError(err.message || 'Failed to load knowledge items');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setFormData({ title: '', content: '', type: 'FAQ', tags: '' });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: KnowledgeItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      content: item.content,
      type: item.type,
      tags: item.tags?.join(', ') || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const tags = formData.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const data = {
        title: formData.title,
        content: formData.content,
        type: formData.type,
        tags,
      };

      if (editingItem) {
        await apiClient.updateKnowledgeItem(editingItem.knowledge_id, data);
      } else {
        await apiClient.createKnowledgeItem(data);
      }

      setIsDialogOpen(false);
      loadItems();
      toast({
        title: editingItem ? 'Knowledge updated' : 'Knowledge added',
        description: 'Your knowledge base is ready for the AI.',
      });
    } catch (err: any) {
      console.error('Error saving knowledge item:', err);
      toast({
        title: 'Save failed',
        description: err.message || 'Failed to save knowledge item',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (item: KnowledgeItem) => {
    setDeleteTarget(item);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteKnowledgeItem(deleteTarget.knowledge_id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      loadItems();
      toast({ title: 'Deleted', description: 'Knowledge item removed.' });
    } catch (err: any) {
      console.error('Error deleting knowledge item:', err);
      toast({
        title: 'Delete failed',
        description: err.message || 'Failed to delete knowledge item',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'FAQ': return 'bg-blue-100 text-blue-700';
      case 'SERVICE': return 'bg-green-100 text-green-700';
      case 'POLICY': return 'bg-purple-100 text-purple-700';
      case 'PRODUCT': return 'bg-orange-100 text-orange-700';
      case 'SAFETY': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Knowledge"
        title="Knowledge base"
        subtitle="Teach your AI about services, policies, and service areas."
        actions={
          activeTab === 'knowledge' ? (
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Knowledge
            </Button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center px-4 py-2 rounded-full border text-sm transition-colors ${
            activeTab === 'knowledge'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-transparent bg-white/70 text-slate-500 hover:text-slate-700'
          }`}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Q&A and Info
        </button>
        <button
          onClick={() => setActiveTab('service-area')}
          className={`flex items-center px-4 py-2 rounded-full border text-sm transition-colors ${
            activeTab === 'service-area'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-transparent bg-white/70 text-slate-500 hover:text-slate-700'
          }`}
        >
          <MapPin className="h-4 w-4 mr-2" />
          Service Area
        </button>
      </div>

      {activeTab === 'knowledge' && (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-800">{error}</p>
              <button onClick={loadItems} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
                Try again
              </button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Your Knowledge Items ({items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-6 bg-gray-200 rounded w-2/3 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                    </div>
                  ))}
                </div>
              ) : items.length > 0 ? (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div
                      key={item.knowledge_id}
                      className="border border-emerald-100/70 bg-white/85 rounded-xl p-4 hover:-translate-y-[1px] hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-900">{item.title}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(item.type)}`}>
                              {item.type}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 line-clamp-2">{item.content}</p>
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {item.tags.map((tag, idx) => (
                                <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(item)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<MessageSquare className="h-10 w-10" />}
                  title="No knowledge items yet"
                  description="Add FAQs, service information, and policies to help your AI answer customer questions."
                  action={
                    <Button onClick={handleCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Item
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'service-area' && (
        <ServiceAreaTab />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Knowledge Item' : 'Create Knowledge Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., What are your business hours?"
              />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    type: value as 'FAQ' | 'SERVICE' | 'POLICY' | 'PRODUCT' | 'SAFETY',
                  })
                }
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FAQ">FAQ</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="POLICY">Policy</SelectItem>
                  <SelectItem value="PRODUCT">Product</SelectItem>
                  <SelectItem value="SAFETY">Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
                placeholder="Enter detailed information..."
              />
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="e.g., hours, contact, support"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!formData.title || !formData.content}>
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete knowledge item</DialogTitle>
            <DialogDescription>
              This will permanently remove "{deleteTarget?.title || 'this item'}" from your knowledge base.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
