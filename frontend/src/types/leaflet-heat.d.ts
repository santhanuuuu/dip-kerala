// leaflet.heat has no official type package -- it's a side-effect module that patches the
// Leaflet namespace (adds L.heatLayer(...)) rather than exporting anything itself. This stub
// just lets `import('leaflet.heat')` type-check under strict mode; the actual heatLayer call
// is made through `(L as any).heatLayer(...)` in DashboardPage.tsx since the patched method
// isn't part of @types/leaflet's declarations.
declare module 'leaflet.heat';