import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import { 
  MapPin, 
  Bike, 
  Car, 
  Bell, 
  User as UserIcon, 
  Navigation, 
  CheckCircle, 
  XSquare, 
  Loader2,
  LogOut,
  Navigation2,
  ArrowRight,
  Clock,
  Compass,
  AlertTriangle,
  Zap,
  Layers,
  Map as MapIcon,
  RefreshCw,
  ShieldCheck,
  Flag,
  User
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';

// Fix Leaflet marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// V2 Pulsing Marker
const PULSE_ICON = L.divIcon({
  className: 'marker-pulse',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const RIDER_ICON_V3 = L.divIcon({
  className: 'custom-rider-icon',
  html: `<div style="background: #8b5cf6; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(139, 92, 246, 0.6); border: 4px solid #fff;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/></svg>
  </div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});

const PASSENGER_ICON = L.divIcon({
  className: 'custom-passenger-icon',
  html: `<div style="background: #ec4899; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(236, 72, 153, 0.6); border: 4px solid #fff;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  </div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});

// Helper for distance (Returns KM)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return "---";
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2);
};

function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('landing');
  const [mapStyle, setMapStyle] = useState('satellite'); 
  const [vehicle, setVehicle] = useState('bike');
  const [isDriving, setIsDriving] = useState(false);
  const [location, setLocation] = useState(null);
  const [nearbyTrips, setNearbyTrips] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTripId, setActiveTripId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSecureContext, setIsSecureContext] = useState(window.isSecureContext);
  
  const [loginTime, setLoginTime] = useState(null);
  const [activeConnection, setActiveConnection] = useState(null); 
  const [arrivalStatus, setArrivalStatus] = useState(null); 
  
  const watchId = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('travel_user');
    const savedTime = localStorage.getItem('travel_session_start');
    if (savedUser && savedTime) {
      const elapsed = (Date.now() - parseInt(savedTime)) / (1000 * 60);
      if (elapsed < 30) {
        setUser(JSON.parse(savedUser));
        setLoginTime(parseInt(savedTime));
      } else { handleLogout(); }
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (userData) => {
    const now = Date.now();
    setUser(userData);
    setLoginTime(now);
    localStorage.setItem('travel_user', JSON.stringify(userData));
    localStorage.setItem('travel_session_start', now.toString());
    requestLocation();
    supabase.from('trips').update({ status: 'completed' }).eq('user_name', userData.username).eq('status', 'active');
  };

  const handleLogout = async () => {
    if (user) {
        await supabase.from('trips').update({ status: 'completed' }).eq('user_name', user.username);
    }
    localStorage.removeItem('travel_user');
    localStorage.removeItem('travel_session_start');
    setUser(null);
    setMode('landing');
    setLocation(null);
    setActiveConnection(null);
    setLoginTime(null);
    setArrivalStatus(null);
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
  };

  useEffect(() => {
    if (user && loginTime) {
      const interval = setInterval(() => {
        if ((Date.now() - loginTime) / (1000 * 60) >= 30) {
          handleLogout();
        }
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user, loginTime]);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => { if (user && !location) requestLocation(); }, [user]);

  useEffect(() => {
    const handleUnload = async () => {
      if (activeTripId) await supabase.from('trips').update({ status: 'completed' }).eq('id', activeTripId);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [activeTripId]);

  useEffect(() => {
    if (activeConnection && location) {
      const dist = parseFloat(calculateDistance(activeConnection.riderLat, activeConnection.riderLng, activeConnection.passengerLat, activeConnection.passengerLng));
      if (dist <= 1.0) setArrivalStatus('tracking');
      if (dist <= 0.1 && arrivalStatus !== 'arrived') {
        const triggerArrival = async () => {
            setArrivalStatus('arrived');
            if (isDriving && activeConnection.reqId) {
                await supabase.from('requests').update({ status: 'arrived' }).eq('id', activeConnection.reqId);
            }
            setTimeout(() => handleLogout(), 10000);
        };
        triggerArrival();
      }
    }
  }, [activeConnection, location, arrivalStatus]);

  useEffect(() => {
    if (user) {
      const channel = supabase.channel('v6_passenger')
        .on('postgres_changes', { 
          event: 'UPDATE', schema: 'public', table: 'requests', filter: `passenger_name=eq.${user.username}`
        }, (payload) => {
          if (payload.new.status === 'accepted' || payload.new.status === 'arrived') {
            const trip = nearbyTrips.find(t => t.id == payload.new.trip_id);
            if (trip) {
              setActiveConnection({
                reqId: payload.new.id,
                tripId: trip.id,
                name: trip.user_name,
                riderLat: trip.lat,
                riderLng: trip.lng,
                passengerLat: location?.lat,
                passengerLng: location?.lng
              });
              if (payload.new.status === 'arrived') setArrivalStatus('arrived');
            }
          }
        }).subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [user, nearbyTrips, location]);

  useEffect(() => {
    if (isDriving && location && activeConnection) {
       setActiveConnection(prev => prev ? ({...prev, riderLat: location.lat, riderLng: location.lng}) : null);
    }
  }, [location, isDriving]);

  useEffect(() => {
    if (user) {
      const fetchTrips = async () => {
        // Removed gt(created_at) filter to avoid timezone/format mismatches
        const { data } = await supabase.from('trips')
          .select('*')
          .eq('status', 'active');
        
        if (data) {
          setNearbyTrips(data);
          if (activeConnection) {
            const currentTrip = data.find(t => t.id == activeConnection.tripId);
            if (currentTrip) {
               setActiveConnection(prev => prev ? ({...prev, riderLat: currentTrip.lat, riderLng: currentTrip.lng}) : null);
            }
          }
        }
      };
      
      fetchTrips();
      const sub = supabase.channel('v6_trips_final').on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips).subscribe();
      return () => supabase.removeChannel(sub);
    }
  }, [user, activeConnection, isDriving]);

  useEffect(() => {
    if (isDriving && activeTripId) {
      const chan = supabase.channel(`v6_requests_${activeTripId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `trip_id=eq.${activeTripId}` }, (payload) => {
           if (payload.eventType === 'INSERT') {
             setNotifications(prev => [...prev, { id: Date.now(), message: `${payload.new.passenger_name} leads a lift!`, requestId: payload.new.id, lat: payload.new.lat, lng: payload.new.lng }]);
           } else if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted') {
             setActiveConnection({
               reqId: payload.new.id,
               tripId: activeTripId, 
               name: payload.new.passenger_name,
               passengerLat: payload.new.lat,
               passengerLng: payload.new.lng,
               riderLat: location?.lat,
               riderLng: location?.lng
             });
           } else if (payload.eventType === 'UPDATE' && payload.new.status === 'arrived') {
             setArrivalStatus('arrived');
             setTimeout(handleLogout, 10000);
           }
        }).subscribe();
      return () => supabase.removeChannel(chan);
    }
  }, [isDriving, activeTripId, location]);

  const handleStartTrip = async () => {
    if (!location) return requestLocation();
    await supabase.from('trips').update({ status: 'completed' }).eq('user_name', user.username);
    setIsDriving(true);
    const { data, error } = await supabase.from('trips').insert([{
      user_name: user.username, vehicle_type: vehicle, status: 'active', lat: location.lat, lng: location.lng
    }]).select().single();

    if (error) return setIsDriving(false);
    setActiveTripId(data.id);
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        await supabase.from('trips').update({ lat: pos.coords.latitude, lng: pos.coords.longitude }).eq('id', data.id);
      },
      () => {}, { enableHighAccuracy: true }
    );
  };

  const handleStopTrip = async () => {
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    setIsDriving(false);
    if (activeTripId) await supabase.from('trips').update({ status: 'completed' }).eq('id', activeTripId);
    setActiveTripId(null);
    setActiveConnection(null);
    setArrivalStatus(null);
  };

  const handleJoinTrip = async (trip) => {
     if (!location) return requestLocation();
     await supabase.from('requests').insert([{
        trip_id: trip.id,
        passenger_name: user.username,
        lat: location.lat,
        lng: location.lng,
        status: 'pending'
     }]);
     alert("Join request sent!");
  };

  if (loading) return <div className="auth-container"><Loader2 className="animate-spin" size={64} color="#8b5cf6" /></div>;
  if (!user) return <Auth onAuthSuccess={handleLoginSuccess} />;

  return (
    <div className="app-container">
      <AnimatePresence>
        {arrivalStatus === 'tracking' && activeConnection && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="notification">
             <div style={{ background: '#22c55e', padding: '15px', borderRadius: '50%', marginBottom: '10px' }}><Navigation2 size={32} color="white" /></div>
             <p style={{ margin: 0, fontWeight: 900, fontSize: '1.4rem' }}>{activeConnection.name} IS NEAR!</p>
             <h1 className="gradient-text" style={{ fontSize: '5rem', margin: '15px 0' }}>{calculateDistance(activeConnection.riderLat, activeConnection.riderLng, activeConnection.passengerLat, activeConnection.passengerLng)} KM</h1>
             <p style={{ opacity: 0.6, fontWeight: 600 }}>Approaching Pickup...</p>
          </motion.div>
        )}

        {arrivalStatus === 'arrived' && (
          <motion.div initial={{ scale: 1.1, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="notification" style={{ background: '#22c55e', border: 'none' }}>
             <div style={{ background: 'white', padding: '20px', borderRadius: '50%', marginBottom: '15px' }}><CheckCircle size={48} color="#22c55e" /></div>
             <p style={{ margin: 0, fontWeight: 900, fontSize: '2.4rem', color: 'white' }}>RIDER ARRIVED!</p>
             <p style={{ margin: '10px 0 0', color: 'white', opacity: 0.9, fontWeight: 600 }}>Enjoy your journey! <br /> Logging out safely in 10s...</p>
          </motion.div>
        )}

        {notifications.map(notif => (
          <motion.div key={notif.id} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="notification">
            <div style={{ background: '#8b5cf6', padding: '15px', borderRadius: '50%', marginBottom: '15px' }}><Bell size={32} color="white" /></div>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <p style={{ margin: 0, fontWeight: 900, fontSize: '1.6rem' }}>Lift Requested!</p>
              <p style={{ margin: '8px 0 0', fontSize: '1rem', opacity: 0.7, fontWeight: 600 }}>{notif.message}</p>
            </div>
            <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
              <button 
                onClick={() => supabase.from('requests').update({ status: 'accepted' }).eq('id', notif.requestId).then(() => setNotifications(n => n.filter(x => x.id !== notif.id)))} 
                style={{ flex: 2, padding: '1.2rem', background: '#22c55e', borderRadius: '20px', fontWeight: 900, fontSize: '1.1rem' }}
              >
                Accept
              </button>
              <button 
                onClick={() => supabase.from('requests').update({ status: 'rejected' }).eq('id', notif.requestId).then(() => setNotifications(n => n.filter(x => x.id !== notif.id)))} 
                style={{ flex: 1, padding: '1.2rem', background: '#ef4444', borderRadius: '20px', fontWeight: 900, fontSize: '1.1rem' }}
              >
                <XSquare size={24} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="nav-bar">
        <div className="logo gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Compass size={32} /> TRAVEL WITH ME
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {mode !== 'landing' && (
            <button onClick={() => setMode('landing')} className="glass-card" style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 600 }}>
              Exit Mode
            </button>
          )}
          <div className="glass-card" style={{ padding: '10px 20px', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--primary-glow)' }}>
            <UserIcon size={18} color="#8b5cf6" /> 
            <span style={{fontWeight: 800, fontSize: '1rem'}}>{user.username}</span>
          </div>
          <button onClick={handleLogout} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '18px' }}>
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {!location && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="location-warning glass-card">
           <AlertTriangle color="#f59e0b" size={24} />
           <div style={{flex: 1, textAlign: 'left'}}>
              <p style={{margin: 0, fontWeight: 800, fontSize: '1.1rem'}}>Location Required</p>
              <p style={{margin: 0, fontSize: '0.9rem', opacity: 0.7}}>Ensure GPS is enabled and permissions are granted.</p>
           </div>
           <button onClick={requestLocation} style={{background: '#f59e0b', padding: '8px 20px', fontSize: '0.9rem', fontWeight: 800}}>Enable GPS</button>
        </motion.div>
      )}

      {mode === 'landing' ? (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card" style={{ padding: '6rem 3rem', background: 'radial-gradient(circle at top right, rgba(139,92,246,0.1), transparent)' }}>
          <ShieldCheck size={72} color="#22c55e" style={{marginBottom: '2rem'}} />
          <h1 style={{ fontSize: '4.5rem', marginBottom: '1.5rem', fontWeight: 900, lineHeight: 1 }}>College Travel. <br /><span className="gradient-text">Redefined.</span></h1>
          <p style={{ opacity: 0.6, fontSize: '1.3rem', marginBottom: '5rem', maxWidth: '600px', margin: '0 auto 5rem' }}>Secure, real-time campus ride network with 0.1s update latency.</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', maxWidth: '900px', margin: '0 auto' }}>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              onClick={() => setMode('rider')} 
              className="glass-card" 
              style={{ padding: '4rem 2rem', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)' }}
            >
              <Bike size={64} color="#8b5cf6" />
              <div style={{ marginTop: '2rem', fontSize: '1.8rem', fontWeight: 900 }}>RIDER</div>
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              onClick={() => setMode('passenger')} 
              className="glass-card" 
              style={{ padding: '4rem 2rem', background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.1)' }}
            >
              <Navigation size={64} color="#ec4899" />
              <div style={{ marginTop: '2rem', fontSize: '1.8rem', fontWeight: 900 }}>PASSENGER</div>
            </motion.button>
          </div>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          <div className="map-container">
            <button 
              onClick={() => setMapStyle(mapStyle === 'satellite' ? 'dark' : 'satellite')} 
              style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 1000, padding: '12px 18px', borderRadius: '18px', background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(10px)' }}
            >
              <Layers size={18} /> {mapStyle === 'satellite' ? 'Dark View' : 'Satellite View'}
            </button>
            <MapContainer center={[location?.lat || 12.97, location?.lng || 77.59]} zoom={16} style={{ height: '100%', width: '100%' }}>
              <ChangeView center={[location?.lat || 12.97, location?.lng || 77.59]} />
              <TileLayer url={mapStyle === 'satellite' ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} />
              {nearbyTrips.map(t => (
                <Marker key={t.id} position={[t.lat, t.lng]} icon={PULSE_ICON}>
                  <Popup closeButton={false}>
                    <div style={{ color: 'black', padding: '15px', textAlign: 'center' }}>
                      <strong style={{fontSize: '1.2rem'}}>{t.user_name}</strong><br />
                      <span style={{opacity: 0.7, fontSize: '0.9rem'}}>{calculateDistance(location?.lat, location?.lng, t.lat, t.lng)} KM away</span><br />
                      <button onClick={() => handleJoinTrip(t)} style={{marginTop: '15px', width: '100%', padding: '10px', borderRadius: '12px'}}>Join Ride</button>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {location && <Marker position={[location.lat, location.lng]} icon={mode === 'rider' ? RIDER_ICON_V3 : PASSENGER_ICON} />}
              {activeConnection && (
                <>
                  <Polyline 
                    positions={[[activeConnection.riderLat, activeConnection.riderLng], [activeConnection.passengerLat, activeConnection.passengerLng]]} 
                    color={mode === 'rider' ? "#8b5cf6" : "#ec4899"} 
                    weight={6} 
                    dashArray="12, 12"
                  />
                  <Marker position={[mode === 'rider' ? activeConnection.passengerLat : activeConnection.riderLat, mode === 'rider' ? activeConnection.passengerLng : activeConnection.riderLng]} icon={mode === 'rider' ? PASSENGER_ICON : RIDER_ICON_V3} />
                </>
              )}
            </MapContainer>
            <div className="distance-badge">
              <Zap size={18} fill="#8b5cf6" /> 
              {activeConnection 
                ? `TRACKING ${activeConnection.name.toUpperCase()} • ${calculateDistance(activeConnection.riderLat, activeConnection.riderLng, activeConnection.passengerLat, activeConnection.passengerLng)} KM` 
                : "LIVE CAMPUS SCAN ACTIVE"}
            </div>
          </div>

          <div className="glass-card" style={{textAlign: 'left', padding: '2.5rem'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
              <div>
                <h3 style={{fontSize: '2rem', margin: 0, fontWeight: 900}}>Nearby Students</h3>
                <p style={{opacity: 0.5, margin: '5px 0 0', fontSize: '1rem'}}>Scanning for active rides in last 30 mins</p>
              </div>
              {mode === 'rider' && (
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={isDriving ? handleStopTrip : handleStartTrip}
                  style={{ padding: '1.2rem 3rem', background: isDriving ? '#ef4444' : '#8b5cf6', fontWeight: 900, fontSize: '1.1rem', borderRadius: '22px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}
                >
                  {isDriving ? "STOP BROADCAST" : "START BROADCAST"}
                </motion.button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {nearbyTrips.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                  <Compass size={48} className="animate-pulse" style={{ margin: '0 auto 1rem' }} />
                  <p style={{fontWeight: 600}}>No active students right now</p>
                  <p style={{fontSize: '0.85rem'}}>Be the first to start a broadcast!</p>
                </div>
              ) : (
                nearbyTrips.map(t => (
                  <motion.div whileHover={{ y: -5 }} key={t.id} className="glass-card" style={{ padding: '1.8rem', display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ padding: '16px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '22px' }}>
                      {t.vehicle_type === 'bike' ? <Bike size={32} color="#8b5cf6" /> : <Car size={32} color="#8b5cf6" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{fontWeight: 900, fontSize: '1.4rem'}}>{t.user_name}</div>
                      <div style={{fontSize: '0.95rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '6px', color: parseFloat(calculateDistance(location?.lat, location?.lng, t.lat, t.lng)) < 1 ? '#22c55e' : 'inherit'}}>
                        <Clock size={16} /> {calculateDistance(location?.lat, location?.lng, t.lat, t.lng)} KM away
                      </div>
                    </div>
                    <button onClick={() => handleJoinTrip(t)} style={{ padding: '16px', borderRadius: '18px', background: 'rgba(255,255,255,0.05)' }}><Navigation2 size={24} /></button>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
