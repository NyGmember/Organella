export interface ModuleSlotDeclaration {
  slotId: 'patient-workspace-tab' | 'patient-banner-action' | 'dashboard-widget' | 'main-nav-item' | string;
  title: string;
  component: string;
}

export interface ModuleFrontendConfig {
  entry: string;
  slots: ModuleSlotDeclaration[];
}

export interface ModuleBackendConfig {
  pluginPackage?: string;
  apiPrefix?: string;
  hooks?: string[];
}

export interface ModuleManifest {
  $schema?: string;
  id: string;
  name: string;
  version: string;
  author: string;
  license?: string;
  description: string;
  minCoreVersion?: string;
  permissions: string[];
  frontend: ModuleFrontendConfig;
  backend?: ModuleBackendConfig;
}
