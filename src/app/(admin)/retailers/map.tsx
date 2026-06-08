'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MapPin, RefreshCw, X } from 'lucide-react'

export default function RetailersMap() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [geocoding, setGeocoding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selected, setSelected] = useState<any>(null)
  const [mapReady, setMapReady] = useState(false)

  const { data: retailers = [] } = useQuery({
    queryKey: ['retailers'],
    queryFn: async () => {
      const { data } = await supabase.from('retailers').select('*').order('shop_name')
      return data ?? []
    }
  })

  const withCoords = (retailers as any[]).filter((r: any) => r.lat && r.lng)
  const withoutCoords = (retailers as any[]).filter((r: any) => !r.lat || !r.lng)

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    // Inject Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    import('leaflet').then(L => {
      // Fix default icon
      const DefaultIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
        popupAnchor: [1, -34], shadowSize: [41, 41],
      })
      L.Marker.prototype.options.icon = DefaultIcon

      const map = L.map(mapRef.current!, { center: [46.8, 2.3], zoom: 6 })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        setMapReady(false)
      }
    }
  }, [])

  // Update markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return
    import('leaflet').then(L => {
      // Remove old markers
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      // Add new markers
      withCoords.forEach((r: any) => {
        const marker = L.marker([r.lat, r.lng])
          .addTo(mapInstanceRef.current)
          .bindTooltip(r.shop_name, { permanent: false, direction: 'top', offset: [0, -30] })
          .on('click', () => setSelected(r))
        markersRef.current.push(marker)
      })
    })
  }, [mapReady, retailers])

  const handleGeocode = async () => {
    if (withoutCoords.length === 0) return
    setGeocoding(true)
    setProgress(0)
    for (let i = 0; i < withoutCoords.length; i++) {
      const r = withoutCoords[i]
      const address = [r.street, r.postal_code, r.city, 'France'].filter(Boolean).join(', ')
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'DH-CRM/1.0' } }
        )
        const data = await res.json()
        if (data[0]) {
          await supabase.from('retailers').update({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          }).eq('id', r.id)
        }
      } catch {}
      setProgress(i + 1)
      await new Promise(res => setTimeout(res, 1100))
    }
    queryClient.invalidateQueries({ queryKey: ['retailers'] })
    setGeocoding(false)
  }

  const contacts = selected?.contacts ?? []

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 260px)', minHeight: 500 }}>

      {/* Controls */}
      <div className="absolute top-3 left-3 z-[1000] space-y-2">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">
            {withCoords.length} / {(retailers as any[]).length} on map
          </p>
          {withoutCoords.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{withoutCoords.length} without coordinates</p>
          )}
        </div>
        {withoutCoords.length > 0 && (
          <button onClick={handleGeocode} disabled={geocoding}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium shadow-md hover:bg-gray-700 disabled:opacity-70 transition-colors w-full justify-center">
            <RefreshCw className={`h-4 w-4 ${geocoding ? 'animate-spin' : ''}`} />
            {geocoding ? `${progress}/${withoutCoords.length}...` : `Geocode ${withoutCoords.length}`}
          </button>
        )}
      </div>

      {/* Map container */}
      <div ref={mapRef} className="w-full h-full rounded-xl border border-gray-200 overflow-hidden" />

      {/* Shop detail panel */}
      {selected && (
        <div className="absolute top-3 right-3 z-[1000] w-72 bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{selected.shop_name}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {[selected.street, selected.postal_code, selected.city].filter(Boolean).join(', ')}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 ml-2 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          {contacts.length > 0 && (
            <div className="space-y-1 border-t border-gray-100 pt-2 mt-2">
              {contacts.map((c: any, i: number) => (
                <div key={i} className="text-xs space-y-0.5">
                  {c.email && <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline block truncate">{c.email}</a>}
                  {c.mobile && <a href={`tel:${c.mobile}`} className="text-gray-600 hover:text-gray-900 block">{c.mobile}</a>}
                </div>
              ))}
            </div>
          )}
          {selected.comments && (
            <p className="text-xs text-gray-500 mt-2 border-t border-gray-100 pt-2 line-clamp-3">{selected.comments}</p>
          )}
        </div>
      )}
    </div>
  )
}