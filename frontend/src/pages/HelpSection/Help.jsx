import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowLeft, FaSearch, FaBook, FaQuestionCircle, FaEnvelope, FaPhone, FaTimes, FaCheckCircle, FaChevronDown,
  FaHeart, FaShieldAlt, FaLock, FaUsers, FaTrash, FaDownload, FaMobileAlt } from 'react-icons/fa';
import useThemeStore from '../../stores/useThemeStore';
import Layout from '../../components/Layout';

//! ========== HELP TOPICS – SAFE & WHATSAPP‑LIKE ==========
const helpTopics = [
  {
    id: 'getting-started',
    icon: FaBook,
    title: 'Getting Started',
    description: 'Learn the basics of using WhatsApp',
    color: 'bg-green-500', // WhatsApp green
    content: {
      type: 'steps',
      steps: [
        { icon: FaMobileAlt, text: 'Download WhatsApp from the App Store or Google Play' },
        { icon: FaCheckCircle, text: 'Verify your phone number with the OTP sent to you' },
        { icon: FaUsers, text: 'Set up your profile (add a photo and a short “about” message)' },
        { icon: FaHeart, text: 'Start a chat with any contact from your phonebook' },
        { icon: FaUsers, text: 'Create a group to chat with multiple friends at once' },
        { icon: FaShieldAlt, text: 'Enable two‑step verification for extra security' }
      ]
    }
  },
  {
    id: 'faq',
    icon: FaQuestionCircle,
    title: 'Frequently Asked Questions',
    description: 'Answers to common questions',
    color: 'bg-blue-500', // WhatsApp blue
    content: {
      type: 'faq',
      faqs: [
        {
          q: 'How do I delete a message?',
          a: 'Tap and hold the message, then select “Delete”. You can delete it for yourself only, or for everyone (within one hour of sending).',
          icon: FaTrash
        },
        {
          q: 'Can I use WhatsApp on multiple devices?',
          a: 'Yes! You can use WhatsApp Web and link up to 4 additional devices, even if your phone is offline.',
          icon: FaMobileAlt
        },
        {
          q: 'How do I back up my chats?',
          a: 'Go to Settings > Chats > Chat backup. You can choose to back up to Google Drive (Android) or iCloud (iPhone) manually or automatically.',
          icon: FaDownload
        },
        {
          q: 'Is WhatsApp really free?',
          a: 'WhatsApp is free to download and use. Standard data charges from your mobile provider may apply.',
          icon: FaHeart
        },
        {
          q: 'How do I block a contact?',
          a: 'Open the chat, tap the contact name, scroll down and tap “Block contact”.',
          icon: FaLock
        }
      ]
    }
  },
  {
    id: 'contact-support',
    icon: FaEnvelope,
    title: 'Contact Us',
    description: 'Get in touch with our support team',
    color: 'bg-gray-500', // Neutral gray
    content: {
      type: 'contact',
      // Dummy info – not clickable to avoid accidents
      email: 'support@example.com',
      phone: '+1 (555) 123-4567',
      message: 'For any questions or feedback, please visit our website or use the in‑app feedback form.'
    }
  }
];

function Help() {
  const { theme } = useThemeStore();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const modalRef = useRef(null);

  //! Filter topics based on search
  const filteredTopics = helpTopics.filter(topic =>
    topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    topic.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  //! Close modal on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
        setSelectedTopic(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalOpen]);

  //! Highlight search term
  const highlightText = (text, highlight) => {
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-300 dark:bg-yellow-500 rounded px-1">
          {part}
        </mark>
      ) : part
    );
  };

  const openTopic = (topic) => {
    setSelectedTopic(topic);
    setModalOpen(true);
    setExpandedFaq(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedTopic(null);
    setExpandedFaq(null);
  };

  //! Render modal content based on topic type
  const renderModalContent = () => {
    if (!selectedTopic) return null;

    const content = selectedTopic.content;

    switch (content.type) {
      case 'steps':
        return (
          <div className="space-y-5 sm:mb-3">
            {content.steps.map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-start gap-4 pb-2"
              >
                <div className={`p-2 rounded-lg ${selectedTopic.color} text-white shadow-md`}>
                  <step.icon className="h-5 w-5" />
                </div>
                <span className={`flex-1 text-sm md:text-base ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  {step.text}
                </span>
              </motion.div>
            ))}
          </div>
        );

      case 'faq':
        return (
          <div className="space-y-3 pb-6 sm:mb-6">
            {content.faqs.map((faq, idx) => (
              <div
                key={idx}
                className={`rounded-xl overflow-hidden border 
                    ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className={`w-full flex items-center justify-between p-4 text-left transition-colors
                    ${expandedFaq === idx
                      ? theme === 'dark' ? 'bg-[#2a3942]' : 'bg-gray-100'
                      : theme === 'dark' ? 'hover:bg-[#202c33]' : 'hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <faq.icon className={`h-5 w-5 ${selectedTopic.color.replace('bg-', 'text-')}`} />
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {faq.q}
                    </span>
                  </div>
                  <FaChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      expandedFaq === idx ? 'rotate-180' : ''
                    } ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}
                  />
                </button>
                <AnimatePresence>
                  {expandedFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className={`overflow-hidden border-t ${
                        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                      }`}
                    >
                      <p className={`p-4 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        );

      case 'contact':
        return (
          <div className="space-y-4 pb-4">
            {/* Dummy email – not clickable */}
            <div
              className={`flex items-center gap-4 p-4 rounded-xl ${
                theme === 'dark' ? 'bg-[#2a3942]' : 'bg-gray-100'
              }`}
            >
              <div className={`p-2 rounded-lg ${selectedTopic.color} text-white shadow-md`}>
                <FaEnvelope className="h-5 w-5" />
              </div>
              <span className={`flex-1 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {content.email}
              </span>
            </div>
            {/* Dummy phone – not clickable */}
            <div
              className={`flex items-center gap-4 p-4 rounded-xl ${
                theme === 'dark' ? 'bg-[#2a3942]' : 'bg-gray-100'
              }`}
            >
              <div className={`p-2 rounded-lg ${selectedTopic.color} text-white shadow-md`}>
                <FaPhone className="h-5 w-5" />
              </div>
              <span className={`flex-1 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {content.phone}
              </span>
            </div>
            {/* Informational message */}
            <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {content.message}
            </p>
          </div>
        );

      default:
        return null;
    }
  };


  return (
    <Layout>
      <div
        className={`w-full md:w-[360px] max-w-full md:max-w-[360px] min-w-0 md:min-w-[360px] h-screen 
          flex flex-col relative border-r overflow-hidden
          ${theme === 'dark'
            ? 'border-gray-600 bg-[#111b21]'
            : 'border-gray-200 bg-white'}`}
      >
        {/*//^  Fixed Header */}
        <div
          className={`fixed top-0 z-40 w-full md:w-[360px] border-r backdrop-blur-sm bg-opacity-90
            ${theme === 'dark'
              ? 'border-gray-600 bg-[#111b21]/90'
              : 'border-gray-200 bg-white/90'}`}
        >
          <div className="p-4 flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(-1)}
              className={`p-2 rounded-full transition-colors
                ${theme === 'dark' ? 'hover:bg-[#202c33] text-white' : 'hover:bg-gray-100 text-gray-800'}`}
            >
              <FaArrowLeft className="h-5 w-5" />
            </motion.button>
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              Help Center
            </h2>
          </div>

          {/*//& Search Bar */}
          <div className="relative px-1 pb-4">
            <FaSearch
              className={`absolute left-6 top-6 transform -translate-y-1/2 
                ${theme === 'dark' ? 'text-gray-300' : 'text-gray-800'}`}
            />
            <input
              type="text"
              placeholder="Search help topics"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-12 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all
                ${theme === 'dark'
                  ? 'bg-gray-800 text-white border-gray-700 placeholder-gray-300 focus:bg-gray-700'
                  : 'bg-gray-100 text-black border-gray-100 placeholder-gray-700 focus:bg-white'}`}
            />
          </div>
        </div>

        {/*//^  Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-1 pt-[132px] pb-4">
          {filteredTopics.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3 px-1"
            >
              {filteredTopics.map((topic, index) => (
                <motion.div
                  key={topic.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => openTopic(topic)}
                  className={`group relative flex items-start gap-4 p-4 rounded-xl cursor-pointer overflow-hidden
                    ${theme === 'dark'
                      ? 'bg-[#1f2c33] hover:bg-[#2a3942]'
                      : 'bg-white hover:bg-gray-50'}
                    shadow-md hover:shadow-lg transition-all duration-300 border
                    ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}
                >
                  {/*//& Solid color accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${topic.color}`} />

                  <div className={`p-2 rounded-lg ${topic.color} text-white shadow-lg`}>
                    <topic.icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1">
                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {highlightText(topic.title, searchTerm)}
                    </h3>
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {highlightText(topic.description, searchTerm)}
                    </p>
                  </div>

                  <FaChevronDown
                    className={`h-4 w-4 transform -rotate-90 transition-transform group-hover:translate-x-1
                      ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-sm text-gray-400 mt-6"
            >
              No help topics found
            </motion.p>
          )}
        </div>

        {/*//^  ========== DETAIL MODAL ========== */}
        <AnimatePresence>
          {modalOpen && selectedTopic && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              onClick={closeModal}
            >
              {/*//& Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              />

              {/*//& Modal Card */}
              <motion.div
                ref={modalRef}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`relative w-[320px] md:w-[360px] max-h-[80vh] md:max-h-[70vh] rounded-t-2xl md:rounded-2xl overflow-hidden
                  ${theme === 'dark' ? 'bg-[#1f2c33]' : 'bg-white'} shadow-2xl`}
                onClick={(e) => e.stopPropagation()}
              >
                {/*//~ Header with solid color */}
                <div className={`p-5 ${selectedTopic.color} text-white`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <selectedTopic.icon className="h-6 w-6" />
                      <h3 className="text-xl font-bold">{selectedTopic.title}</h3>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={closeModal}
                      className="p-1 hover:bg-white/20 rounded-full transition"
                    >
                      <FaTimes className="h-5 w-5" />
                    </motion.button>
                  </div>
                  <p className="text-sm text-white/80 mt-1">{selectedTopic.description}</p>
                </div>

                {/*//~ Scrollable Content Area */}
                <div className="p-5 max-h-[60vh] overflow-y-auto no-scrollbar">
                  {renderModalContent()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

export default Help