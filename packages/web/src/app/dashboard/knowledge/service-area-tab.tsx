'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ServiceAreaTab() {
    const { company, setCompany } = useAuthStore();
    const { toast } = useToast();
    const [zipCodes, setZipCodes] = useState<string[]>([]);
    const [zipInput, setZipInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (company) {
            setZipCodes((company as any).service_area_zipcodes || []);
        }
    }, [company]);

    const handleAddZip = async () => {
        const val = zipInput.trim();
        if (!val) return;

        if (!/^\d{5}$/.test(val)) {
            toast({
                title: 'Invalid Zip Code',
                description: 'Please enter a valid 5-digit zip code.',
                variant: 'destructive',
            });
            return;
        }

        if (zipCodes.includes(val)) {
            toast({
                title: 'Duplicate Zip Code',
                description: 'This zip code is already in your service area.',
                variant: 'destructive',
            });
            return;
        }

        const newZipCodes = [...zipCodes, val];
        setZipCodes(newZipCodes);
        setZipInput('');
        await saveZipCodes(newZipCodes);
    };

    const handleRemoveZip = async (zip: string) => {
        const newZipCodes = zipCodes.filter((z) => z !== zip);
        setZipCodes(newZipCodes);
        await saveZipCodes(newZipCodes);
    };

    const saveZipCodes = async (newZipCodes: string[]) => {
        setIsSaving(true);
        try {
            // Optimistically update local store if possible, 
            // but rely on API for persistence
            await apiClient.updateMyCompany({ service_area_zipcodes: newZipCodes });

            // Update local store to reflect changes deeply
            if (company) {
                setCompany({ ...company, service_area_zipcodes: newZipCodes } as any);
            }

            toast({
                title: 'Service Area Updated',
                description: 'Your changes have been saved successfully.',
            });
        } catch (error: any) {
            console.error('Failed to update service area:', error);
            toast({
                title: 'Update Failed',
                description: error.message || 'Could not save zip codes.',
                variant: 'destructive',
            });
            // Revert state on error? For now, we keep optimistic state but user might manually refresh
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddZip();
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Service Area (Zip Codes)</CardTitle>
                    <CardDescription>
                        Define the zip codes where you offer your services.
                        The AI assistant will check this list when customers ask for availability.
                        Leave empty to service <strong>all areas</strong>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex gap-2 max-w-sm">
                            <Input
                                placeholder="Enter 5-digit Zip Code"
                                value={zipInput}
                                onChange={(e) => setZipInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                maxLength={5}
                                disabled={isSaving}
                            />
                            <Button onClick={handleAddZip} disabled={!zipInput || isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                            </Button>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-4">
                            {zipCodes.length === 0 && (
                                <div className="p-4 border border-dashed rounded-lg text-gray-500 w-full text-center">
                                    Open Territory - All zip codes accepted
                                </div>
                            )}
                            {zipCodes.map((zip) => (
                                <Badge key={zip} variant="secondary" className="px-3 py-1 text-sm flex items-center gap-2">
                                    {zip}
                                    <button
                                        onClick={() => handleRemoveZip(zip)}
                                        className="hover:text-red-500 transition-colors focus:outline-none"
                                        disabled={isSaving}
                                    >
                                        <X className="h-3 w-3" />
                                        <span className="sr-only">Remove {zip}</span>
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
