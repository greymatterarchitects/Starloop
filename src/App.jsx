import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home.jsx';
import Discover from './pages/Discover.jsx';
import { ClubDetail } from './pages/Clubs.jsx';
import { ChatRoom } from './pages/Chat.jsx';
import Messages, { MessageThread } from './pages/Messages.jsx';
import { NewPost, PostPage } from './pages/PostPages.jsx';
import Profile from './pages/Profile.jsx';
import TrendingAll from './pages/TrendingAll.jsx';
import StarClub from './pages/StarClub.jsx';
import FanProfile from './pages/FanProfile.jsx';
import Party from './pages/Party.jsx';
import { StoryProvider } from './components/StoryViewer.jsx';

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { document.querySelector('.app')?.scrollTo?.(0, 0); window.scrollTo(0, 0); }, [pathname]);
  return (
    <StoryProvider>
      <div className="stage">
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/discover" element={<Navigate to="/clubs" replace />} />
            <Route path="/trending" element={<TrendingAll />} />
            <Route path="/movies" element={<Navigate to="/chat" replace />} />
            <Route path="/clubs" element={<Discover />} />
            <Route path="/clubs/:key" element={<ClubDetail />} />
            <Route path="/chat" element={<Messages />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:userId" element={<MessageThread />} />
            <Route path="/post/:id" element={<PostPage />} />
            <Route path="/new" element={<NewPost />} />
            <Route path="/chat/:room" element={<ChatRoom />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/star/:id" element={<StarClub />} />
            <Route path="/fan/:id" element={<FanProfile />} />
            <Route path="/party/:id" element={<Party />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </div>
      </div>
    </StoryProvider>
  );
}
