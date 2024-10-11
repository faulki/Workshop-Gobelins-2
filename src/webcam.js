import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { displayVideoDetections } from "./displaydetection";
import * as Tone from 'tone'; // Importer Tone.js

let faceDetector;

const video = document.querySelector("#webcam");
const enableWebcamButton = document.querySelector("#webcamButton");

// Créer la barre et le rond pour l'affichage de l'épaisseur
const thicknessBar = document.createElement('div');
const thicknessIndicator = document.createElement('div');

// Styles pour la barre
thicknessBar.style.position = 'absolute';
thicknessBar.style.left = '10px';
thicknessBar.style.top = '50%'; // Centrer verticalement
thicknessBar.style.height = '210px';
thicknessBar.style.width = '10px';
thicknessBar.style.backgroundColor = '#ccc'; // Couleur de fond de la barre
thicknessBar.style.borderRadius = '5px';
thicknessBar.style.transform = 'translateY(-50%)'; // Ajuster pour centrer

// Styles pour le rond
thicknessIndicator.style.position = 'absolute';
thicknessIndicator.style.left = '5px'; // Aligné à gauche de la barre
thicknessIndicator.style.width = '20px';
thicknessIndicator.style.height = '20px';
thicknessIndicator.style.backgroundColor = '#fff'; // Couleur du rond
thicknessIndicator.style.borderRadius = '50%'; // Rendre le rond
thicknessIndicator.style.transition = 'top 0.1s'; // Transition pour le mouvement fluide

// Ajouter la barre et le rond au document
document.body.appendChild(thicknessBar);
document.body.appendChild(thicknessIndicator);

// **Créer un sélecteur de couleur (roue chromatique)**
const colorPicker = document.createElement('input');
colorPicker.type = 'color';
colorPicker.style.position = 'absolute';
colorPicker.style.left = '10px';
colorPicker.style.bottom = '10px'; // Position en bas à gauche
document.body.appendChild(colorPicker);

// Couleur par défaut du trait
let selectedColor = "rgba(39, 191, 245, 0.6)";

// Mettre à jour la couleur lorsque l'utilisateur sélectionne une nouvelle couleur
colorPicker.addEventListener('input', (event) => {
  selectedColor = hexToRGBA(event.target.value, 0.6); // Convertir le hex en RGBA
});

// Fonction pour convertir une couleur hexadécimale en RGBA
function hexToRGBA(hex, alpha = 1) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Initialiser le détecteur de mains
const initializehandsDetector = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  faceDetector = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1
  });
  enableWebcamButton.disabled = false;
};
initializehandsDetector();

// Vérifier si l'accès à la webcam est pris en charge
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// Si la webcam est prise en charge, ajouter un écouteur d'événements au bouton
if (hasGetUserMedia()) {
  enableWebcamButton.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

// Activer la vue webcam en direct et commencer la détection
async function enableCam() {
  video.addEventListener("loadeddata", () => {
    drawCanvas.width = video.videoWidth;
    drawCanvas.height = video.videoHeight;
  });
  if (!faceDetector) {
    alert("Hand Detector is still loading. Please try again..");
    return;
  }

  // Cacher le bouton
  enableWebcamButton.classList.add("display-none");

  // Paramètres de getUserMedia
  const constraints = {
    audio: false,
    video: {
      width: { min: 640, ideal: 800, max: 1280 },
      height: { min: 480, ideal: 600, max: 720 },
    },
  };

  // Activer le flux de la webcam
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(function (stream) {
      video.srcObject = stream;
      video.addEventListener("loadeddata", () => {
        // Ajuster les dimensions du canevas une fois la vidéo chargée
        drawCanvas.width = video.videoWidth;
        drawCanvas.height = video.videoHeight;
        predictWebcam();
      });
    })
    .catch((err) => {
      console.error(err);
    });
}

let lastVideoTime = -1;
let isDrawing = false;
let drawCanvas = document.getElementById('drawCanvas');
let ctx = drawCanvas.getContext('2d');
ctx.lineCap = "round";
ctx.save();
let lastPosition = { x: 0, y: 0 };

// Fonction pour obtenir les coordonnées relatives du canevas
function getRelativeCoordinates(x, y) {
  return {
    x: (1 - x) * drawCanvas.width,
    y: y * drawCanvas.height
  };
}

// Fonction pour démarrer le dessin
function startDrawing(x, y) {
  isDrawing = true;
  ctx.beginPath();
  lastPosition = { x, y };
  ctx.moveTo(lastPosition.x, lastPosition.y);
}

// Fonction pour arrêter le dessin
function stopDrawing() {
  isDrawing = false;
  clearCanvas();
  ctx.restore();
}

// Fonction pour tracer une ligne entre deux points
function draw(x, y) {
  if (!isDrawing) return;

  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = ctx.lineWidth; // Utiliser l'épaisseur actuelle
  ctx.shadowColor = selectedColor; // Utiliser la couleur sélectionnée pour l'ombre
  ctx.shadowBlur = 5; // Ajustez la douceur de l'ombre
  ctx.lineTo(x, y);
  ctx.stroke();  // Assure que les traits sont dessinés

  lastPosition = { x, y };
}

function clearCanvas() {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

// Fonction pour prédire la détection des mains
async function predictWebcam() {
  let startTimeMs = performance.now();

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const hands = await faceDetector.detectForVideo(video, startTimeMs);

    // Vérifie si des mains sont présentes et si elles ont des landmarks
    if (hands && hands.landmarks && hands.landmarks.length > 0) {
      hands.landmarks.forEach((handLandmarks, index) => {
        const handedness = hands.handedness[index];
        const indexFingerTip = handLandmarks[8]; // Landmark 8 est généralement l'index
        const indexFingerBase = handLandmarks[5];

        // Coordonnées de l'index
        const indexTipCoords = getRelativeCoordinates(indexFingerTip.x, indexFingerTip.y);
        const indexBaseCoords = getRelativeCoordinates(indexFingerBase.x, indexFingerBase.y);

        // Gérer la main droite pour le dessin
        if (indexFingerTip && handedness[0].categoryName === "Left") {
          const { x, y } = indexTipCoords;
          if (!isDrawing) {
            startDrawing(x, y);
          }
          draw(x, y);
          playMelody(indexTipCoords.y); // Joue la mélodie en fonction de la position Y
        } else {
          stopDrawing();
        }

        // Vérifier si l'index de la main droite est abaissé pour effacer le canevas
        if (indexTipCoords.y > indexBaseCoords.y && handedness[0].categoryName === "Left") {
          // console.log("Effacement du canvas car l'index est abaissé");
          // stopDrawing();
          // clearCanvas();
        }

        // Ajuster l'épaisseur du trait en fonction de la main gauche (Right dans le code)
        if (handedness[0].categoryName === "Right") {
          const leftHandIndexTipCoords = getRelativeCoordinates(handLandmarks[8].x, handLandmarks[8].y); // Coordonnées de l'index de la main gauche
          
          // Exemple d'échelle d'épaisseur
          const baseLineWidth = 1; // Épaisseur minimale
          const maxLineWidth = 10; // Épaisseur maximale
          
          // Normaliser la position Y pour qu'elle soit entre 0 et 1
          const yPosition = leftHandIndexTipCoords.y; // Position Y de la main gauche
          const normalizedY = 1 - (yPosition / 500); // Normalisation entre 0 et 1
          
          // Ajustement de l'épaisseur en fonction de la position Y
          if (indexTipCoords.y < indexBaseCoords.y) {
            ctx.lineWidth = baseLineWidth + (maxLineWidth - baseLineWidth) * normalizedY; // Ajustement
            console.log("Epaisseur actuelle:", ctx.lineWidth);

            // Mettre à jour la position du rond dans la barre
            const thicknessIndicatorPos = (2.5 - normalizedY) * 203; // Échelle à la hauteur de la barre
            thicknessIndicator.style.top = `${thicknessIndicatorPos}px`; // Positionner le rond
          }
        }
      });
    } else {
      stopDrawing(); // Arrête de dessiner si aucune main ou landmark n'est détecté
    }
  }

  window.requestAnimationFrame(predictWebcam);
}

// Fonction pour jouer une mélodie avec Tone.js
function playMelody(yPosition) {
  const synth = new Tone.Synth().toDestination();
  
  // Définir un tableau de notes
  const notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
  
  // Mapper la position Y à une note (ajustez les valeurs selon vos besoins)
  const normalizedY = Math.max(0, Math.min(1, 1 - (yPosition / drawCanvas.height))); // Normalisation entre 0 et 1
  const noteIndex = Math.floor(normalizedY * (notes.length - 1)); // Obtenir l'index de la note
  const note = notes[noteIndex]; // Sélectionner la note en fonction de la position

  // Jouer la note
  synth.triggerAttackRelease(note, 0.1); // Jouer la note pendant 0.1 seconde
}
