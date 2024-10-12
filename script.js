
        const pubnub = new PubNub({
            publishKey: 'pub-c-436754db-63c3-44ef-9f67-6c798d8fe632',  // Replace with your actual Publish Key
            subscribeKey: 'sub-c-f44b73e4-b274-4dcc-be2b-a0eb1c652a3c' // Replace with your actual Subscribe Key
        });

        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const sendButton = document.getElementById('send');
        const disconnectButton = document.getElementById('disconnect');
        const usernameInput = document.getElementById('username');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');

        let currentChannel = null;
        let localStream;
        let peerConnection;
        const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }; // Use Google's public STUN server

        const waitingUsers = {}; // Object to keep track of waiting users

        // Function to pair users
        function pairUsers(username) {
            const userId = Date.now(); // Unique ID for the user
            waitingUsers[userId] = username; // Add user to waiting list

            // Check if there's another waiting user
            for (const [id, otherUsername] of Object.entries(waitingUsers)) {
                if (id !== userId.toString()) {
                    // Pair the users
                    const chatChannel = `chat-${userId}-${id}`; // Unique channel
                    currentChannel = chatChannel; // Set current channel
                    delete waitingUsers[id]; // Remove paired user from waiting list

                    // Start the WebRTC connection
                    startWebRTCConnection(chatChannel);

                    chat.innerHTML += `<div>Connected to ${otherUsername}. Start chatting!</div>`;
                    return chatChannel; // Return the new channel
                }
            }

            // No available partners; wait for another user
            chat.innerHTML += `<div>${username} is waiting for a partner...</div>`;
            return null;
        }

        // Start the WebRTC connection
        async function startWebRTCConnection(chatChannel) {
            // Get user media
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;

            // Create peer connection
            peerConnection = new RTCPeerConnection(configuration);

            // Add local stream to the peer connection
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            // Listen for remote tracks
            peerConnection.ontrack = (event) => {
                remoteVideo.srcObject = event.streams[0]; // Set remote video stream
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    pubnub.publish({
                        channel: chatChannel,
                        message: { type: 'ice-candidate', candidate: event.candidate }
                    });
                }
            };

            // Create offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            pubnub.publish({
                channel: chatChannel,
                message: { type: 'video-offer', offer: offer }
            });

            pubnub.subscribe({ channels: [chatChannel] });
        }

        // Handle incoming messages
        pubnub.addListener({
            message: async (event) => {
                const { type, offer, answer, candidate } = event.message;

                if (type === 'video-offer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    pubnub.publish({
                        channel: currentChannel,
                        message: { type: 'video-answer', answer: answer }
                    });
                } else if (type === 'video-answer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                } else if (type === 'ice-candidate') {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }
        });

        sendButton.addEventListener('click', () => {
            const username = usernameInput.value;
            if (!username) {
                alert("Please enter a username!");
                return;
            }

            if (!currentChannel) {
                currentChannel = pairUsers(username); // Pair the user and get the channel
            }

            const message = input.value;
            if (message && currentChannel) {
                pubnub.publish({
                    channel: currentChannel,
                    message: { text: message, sender: username }
                });
                input.value = ''; // Clear input field after sending
            }
        });

        disconnectButton.addEventListener('click', () => {
            if (currentChannel) {
                pubnub.unsubscribe({ channels: [currentChannel] });
                currentChannel = null;
                chat.innerHTML += `<div>You have disconnected.</div>`;
            }
            if (peerConnection) {
                peerConnection.close(); // Close the peer connection
                peerConnection = null;
                localVideo.srcObject = null; // Clear local video
                remoteVideo.srcObject = null; // Clear remote video
            }
        });
   
