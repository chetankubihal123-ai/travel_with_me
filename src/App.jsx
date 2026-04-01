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
  Flag
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
  className: 'custom-pulse-marker',
  html: `<div class="marker-pulse"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const RIDER_ICON_V3 = L.divIcon({
  className: 'custom-rider-icon',
  html: `<div style="background: #a855f7; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 25px rgba(168, 85, 247, 0.8); border: 4px solid #fff;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/></svg>
  </div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

const PASSENGER_ICON = L.divIcon({
  className: 'custom-passenger-icon',
  html: `<div style="background: #ec4899; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(236, 72, 153, 0.6); border: 3px solid #fff;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 11c-2 0-3-1-3-3s1-3 3-3 3 1 3 3-1 3-3 3Z"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
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
  
  // Tracking & Auto-Arrived States
  const [loginTime, setLoginTime] = useState(null);
  const [activeConnection, setActiveConnection] = useState(null); 
  const [arrivalStatus, setArrivalStatus] = useState(null); // 'tracking' or 'arrived'
  
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

  // Auto-Logout Timer (30 min)
  useEffect(() => {
    if (user && loginTime) {
      const interval = setInterval(() => {
        if ((Date.now() - loginTime) / (1000 * 60) >= 30) {
          alert("Session Expired (30 mins). Logged out.");
          handleLogout();
        }
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user, loginTime]);

  const requestLocation = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("Location blocked"),
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => { if (user && !location) requestLocation(); }, [user]);

  // Ephemeral: Stop Trip on Window Close/Refresh
  useEffect(() => {
    const handleUnload = async () => {
      if (activeTripId) await supabase.from('trips').update({ status: 'completed' }).eq('id', activeTripId);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [activeTripId]);

  // Arrival Logic: Monitor distance
  useEffect(() => {
    if (activeConnection && location) {
      const dist = parseFloat(calculateDistance(activeConnection.riderLat, activeConnection.riderLng, activeConnection.passengerLat, activeConnection.passengerLng));
      
      // If within 1 KM, show the countdown
      if (dist <= 1.0) {
        setArrivalStatus('tracking');
      }

      // If within 0.1 KM, trigger Arrival
      if (dist <= 0.1 && arrivalStatus !== 'arrived') {
        const triggerArrival = async () => {
            setArrivalStatus('arrived');
            // If rider, update the request status for both people
            if (isDriving && activeConnection.reqId) {
                await supabase.from('requests').update({ status: 'arrived' }).eq('id', activeConnection.reqId);
            }
            // Auto logout both after 10 seconds of Arrival screen
            setTimeout(() => {
               handleLogout();
            }, 10000);
        };
        triggerArrival();
      }
    }
  }, [activeConnection, location, arrivalStatus]);

  // Passenger's connection listener (If request is accepted)
  useEffect(() => {
    if (user && mode === 'passenger') {
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
  }, [user, mode, nearbyTrips, location]);

  // Rider's connection/tracking sync
  useEffect(() => {
    if (isDriving && location && activeConnection) {
       setActiveConnection(prev => prev ? ({...prev, riderLat: location.lat, riderLng: location.lng}) : null);
    }
  }, [location, isDriving]);

  // Map Filter: strictly last 30 mins
  useEffect(() => {
    if (user && mode === 'passenger') {
      const fetchTrips = async () => {
        const expiry = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data } = await supabase.from('trips').select('*').eq('status', 'active').gt('created_at', expiry);
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
      const sub = supabase.channel('v6_trips').on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips).subscribe();
      return () => supabase.removeChannel(sub);
    }
  }, [user, mode, activeConnection]);

  // Rider's request listener
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
      (err) => {}, { enableHighAccuracy: true }
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
     const { error } = await supabase.from('requests').insert([{
        trip_id: trip.id,
        passenger_name: user.username,
        lat: location.lat,
        lng: location.lng,
        status: 'pending'
     }]);
     if (!error) alert("Request sent!");
  };

  if (loading) return <div className="auth-container"><Loader2 className="animate-spin" size={48} color="#a855f7" /></div>;
  if (!user) return <Auth onAuthSuccess={handleLoginSuccess} />;

  return (
    <div className="app-container">
      <AnimatePresence>
        {arrivalStatus === 'tracking' && activeConnection && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="notification" style={{zIndex: 20000}}>
             <div style={{ background: '#22c55e', padding: '15px', borderRadius: '50%' }}><Navigation2 size={28} color="white" /></div>
             <p style={{ margin: 0, fontWeight: 900, fontSize: '1.4rem' }}>{activeConnection.name} IS NEAR!</p>
             <h1 style={{ fontSize: '4rem', margin: '0', color: '#22c55e' }}>{calculateDistance(activeConnection.riderLat, activeConnection.riderLng, activeConnection.passengerLat, activeConnection.passengerLng)} KM</h1>
             <p style={{ opacity: 0.6 }}>Approaching your pickup location...</p>
          </motion.div>
        )}

        {arrivalStatus === 'arrived' && (
          <motion.div initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="notification" style={{zIndex: 20001, background: '#22c55e', border: 'none'}}>
             <div style={{ background: 'white', padding: '15px', borderRadius: '50%' }}><CheckCircle size={32} color="#22c55e" /></div>
             <p style={{ margin: 0, fontWeight: 900, fontSize: '2rem', color: 'white' }}>RIDER ARRIVED!</p>
             <p style={{ margin: 0, color: 'white', opacity: 0.8 }}>Enjoy your ride! Auto-logging out in 10s...</p>
          </motion.div>
        )}

        {notifications.map(notif => (
          <motion.div key={notif.id} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="notification">
            <div style={{ background: 'var(--primary)', padding: '15px', borderRadius: '50%', marginBottom: '10px' }}><Bell size={28} color="white" /></div>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontWeight: 900, fontSize: '1.4rem' }}>Lift Requested!</p>
              <p style={{ margin: '5px 0 0', fontSize: '1rem', opacity: 0.8 }}>{notif.message}</p>
            </div>
            <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
              <button onClick={() => supabase.from('requests').update({ status: 'accepted' }).eq('id', notif.requestId).then(() => setNotifications(n => n.filter(x => x.id !== notif.id)))} style={{ flex: 1, padding: '15px', background: '#22c55e', borderRadius: '18px' }}>Accept</button>
              <button onClick={() => supabase.from('requests').update({ status: 'rejected' }).eq('id', notif.requestId).then(() => setNotifications(n => n.filter(x => x.id !== notif.id)))} style={{ flex: 1, padding: '15px', background: '#ef4444', borderRadius: '18px' }}>Reject</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="nav-bar">
        <div className="logo gradient-text" style={{ fontSize: '1.8rem' }}>TRAVEL WITH ME <span style={{fontSize: '0.7rem', opacity: 0.5}}>V6.0</span></div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {mode !== 'landing' && <button onClick={() => setMode('landing')} className="glass-card" style={{ padding: '10px 20px', border: '1px solid var(--primary)', color: 'var(--primary)' }}>Exit Mode</button>}
          <div className="glass-card" style={{ padding: '10px 20px', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <UserIcon size={20} color="#a855f7" /> 
            <span style={{fontWeight: 800}}>{user.username}</span>
          </div>
          <button onClick={handleLogout} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid #ef4444', padding: '12px', borderRadius: '18px' }}><LogOut size={20} /></button>
        </div>
      </div>

      {!location && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="location-warning glass-card">
           <AlertTriangle color="#ef4444" size={24} />
           <div style={{flex: 1, textAlign: 'left'}}>
              <p style={{margin: 0, fontWeight: 700}}>Location Required</p>
              <p style={{margin: 0, fontSize: '0.85rem'}}>Please grant access to see nearby students.</p>
           </div>
           <button onClick={requestLocation} style={{background: '#ef4444', padding: '8px 15px'}}>Grant</button>
        </motion.div>
      )}

      {mode === 'landing' ? (
        <div className="glass-card" style={{ padding: '5rem 2rem' }}>
          <ShieldCheck size={64} color="#22c55e" style={{marginBottom: '1rem'}} />
          <h1 style={{ fontSize: '3rem', marginBottom: '1rem', fontWeight: 900 }}>Live Ride Tracker <br /><span className="gradient-text">V6.0 Delivery-Style</span></h1>
          <p style={{ opacity: 0.6, fontSize: '1.1rem', marginBottom: '4rem' }}>Real-time distance countdown and automatic arrival alerts enabled.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <button onClick={() => setMode('rider')} className="glass-card" style={{ padding: '3rem' }}><Bike size={48} /><br /><br /><strong>RIDER</strong></button>
            <button onClick={() => setMode('passenger')} className="glass-card" style={{ padding: '3rem' }}><Navigation size={48} /><br /><br /><strong>PASSENGER</strong></button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="map-container">
            <button onClick={() => setMapStyle(mapStyle === 'satellite' ? 'dark' : 'satellite')} style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, padding: '10px', borderRadius: '12px', background: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }}>
              <Layers size={16} />
            </button>
            <MapContainer center={[location?.lat || 12.97, location?.lng || 77.59]} zoom={15} style={{ height: '100%', width: '100%' }}>
              <ChangeView center={[location?.lat || 12.97, location?.lng || 77.59]} />
              <TileLayer url={mapStyle === 'satellite' ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} />
              {nearbyTrips.map(t => (
                <Marker key={t.id} position={[t.lat, t.lng]} icon={PULSE_ICON}>
                  <Popup>
                    <div style={{ color: 'black' }}>
                      <strong>{t.user_name}</strong><br />
                      {calculateDistance(location?.lat, location?.lng, t.lat, t.lng)} KM away<br />
                      <button onClick={() => handleJoinTrip(t)} style={{marginTop: '10px'}}>Join Ride</button>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {location && <Marker position={[location.lat, location.lng]} icon={mode === 'rider' ? RIDER_ICON_V3 : PASSENGER_ICON} />}
              {activeConnection && (
                <>
                  <Polyline 
                    positions={[[activeConnection.riderLat, activeConnection.riderLng], [activeConnection.passengerLat, activeConnection.passengerLng]]} 
                    color={mode === 'rider' ? "#a855f7" : "#ec4899"} 
                    weight={5} 
                    dashArray="10, 10"
                  />
                  <Marker position={[mode === 'rider' ? activeConnection.passengerLat : activeConnection.riderLat, mode === 'rider' ? activeConnection.passengerLng : activeConnection.riderLng]} icon={mode === 'rider' ? PASSENGER_ICON : RIDER_ICON_V3} />
                </>
              )}
            </MapContainer>
            <div className="distance-badge"><Zap size={16} /> V6.0 Live Count: {activeConnection ? calculateDistance(activeConnection.riderLat, activeConnection.riderLng, activeConnection.passengerLat, activeConnection.passengerLng) : '---'} KM</div>
          </div>
          <div className="glass-card" style={{textAlign: 'left'}}>
            <h3 style={{fontSize: '1.5rem', marginBottom: '1.5rem'}}>Active Students</h3>
            {mode === 'rider' && (
              <button 
                onClick={isDriving ? handleStopTrip : handleStartTrip}
                style={{ width: '100%', padding: '1.5rem', marginBottom: '2rem', background: isDriving ? '#ef4444' : 'var(--primary)', fontWeight: 900 }}
              >
                {isDriving ? "STOP BROADCASTING" : "START BROADCASTING"}
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {nearbyTrips.map(t => (
                <div key={t.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ padding: '10px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '15px' }}>
                    {t.vehicle_type === 'bike' ? <Bike size={24} color="#a855f7" /> : <Car size={24} color="#a855f7" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{fontWeight: 800}}>{t.user_name}</div>
                    <div style={{fontSize: '0.85rem', opacity: 0.6}}>{calculateDistance(location?.lat, location?.lng, t.lat, t.lng)} KM away</div>
                  </div>
                  <button onClick={() => handleJoinTrip(t)} style={{ padding: '10px', borderRadius: '12px' }}><Navigation2 size={20} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
