import { ServiceType } from '@handycall/shared';

const TEMPLATE_BY_SERVICE_TYPE: Record<string, string> = {
  [ServiceType.PEST_CONTROL]: 'tmpl_pest_control_v1',
  [ServiceType.PLUMBING]: 'tmpl_plumbing_v1',
  [ServiceType.HVAC]: 'tmpl_hvac_v1',
  [ServiceType.ELECTRICIAN]: 'tmpl_electrical_v1',
  [ServiceType.CLEANING]: 'tmpl_cleaning_v1',
  [ServiceType.CARPET_CLEANING]: 'tmpl_cleaning_v1',
  [ServiceType.WINDOW_CLEANING]: 'tmpl_cleaning_v1',
  [ServiceType.PRESSURE_WASHING]: 'tmpl_cleaning_v1',
  [ServiceType.POOL_SERVICE]: 'tmpl_cleaning_v1',
  [ServiceType.LANDSCAPING]: 'tmpl_landscaping_v1',
  [ServiceType.LAWN_CARE]: 'tmpl_landscaping_v1',
  [ServiceType.TREE_SERVICE]: 'tmpl_landscaping_v1',
  [ServiceType.IRRIGATION]: 'tmpl_landscaping_v1',
  [ServiceType.SNOW_REMOVAL]: 'tmpl_landscaping_v1',
  [ServiceType.ROOFING]: 'tmpl_roofing_v1',
  [ServiceType.AUTO_MECHANIC]: 'tmpl_mechanic_v1',
  [ServiceType.LOCKSMITH]: 'tmpl_locksmith_v1',
  [ServiceType.HANDYMAN]: 'tmpl_general_v1',
  [ServiceType.GARAGE_DOOR]: 'tmpl_general_v1',
  [ServiceType.APPLIANCE_REPAIR]: 'tmpl_general_v1',
  [ServiceType.PAINTING]: 'tmpl_general_v1',
  [ServiceType.FLOORING]: 'tmpl_general_v1',
  [ServiceType.REMODELING]: 'tmpl_general_v1',
  [ServiceType.MOVING]: 'tmpl_general_v1',
  [ServiceType.JUNK_REMOVAL]: 'tmpl_general_v1',
  [ServiceType.FENCING]: 'tmpl_general_v1',
  [ServiceType.CONCRETE]: 'tmpl_general_v1',
  [ServiceType.SOLAR]: 'tmpl_general_v1',
  [ServiceType.SECURITY]: 'tmpl_general_v1',
  [ServiceType.OTHER]: 'tmpl_general_v1',
};

export function resolveServiceTemplateId(serviceType?: string): string {
  const key = String(serviceType || '').toUpperCase();
  return TEMPLATE_BY_SERVICE_TYPE[key] || 'tmpl_general_v1';
}
