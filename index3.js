const express = require('express');
const multer = require('multer');
const Jimp = require('jimp');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

AWS.config.update({ region: 'ap-south-1' });

const rekognitionClient = new AWS.Rekognition();
const bucketName = 'awsrekotest'; // Replace with your S3 bucket name

const app = express();
const port = 3000;

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


app.get('/', (req,res)=>{
  res.send("Working.....!");
})




// Endpoint to upload and detect text in an image
app.post('/detectTextAndMatchFaces', upload.fields([
  { name: 'userImage', maxCount: 1 },
  { name: 'aadharCardImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { userImage, aadharCardImage } = req.files;
    const userPhoto = userImage[0].originalname;
    const aadharPhoto = aadharCardImage[0].originalname;
    
    // Upload the user's photo and Aadhar card photo to S3 bucket
    const s3 = new AWS.S3();

    const userParams = {
      Bucket: bucketName,
      Key: userPhoto,
      Body: userImage[0].buffer,
    };

    const aadharParams = {
      Bucket: bucketName,
      Key: aadharPhoto,
      Body: aadharCardImage[0].buffer,
    };

    await Promise.all([
      s3.upload(userParams).promise(),
      s3.upload(aadharParams).promise()
    ]);

    // Detect text in Aadhar card photo
    const detectTextParams = {
      Image: {
        S3Object: {
          Bucket: bucketName,
          Name: aadharPhoto,
        },
      },
    };

    const textDetectionResult = await rekognitionClient.detectText(detectTextParams).promise();
    const textDetections = textDetectionResult.TextDetections;

    let isAadharCardValid = false;

    for (const textDetection of textDetections) {
      console.log(textDetection.DetectedText);
      console.log(textDetection.DetectedText.length);

      if (textDetection.DetectedText.length === 14) {
        if (textDetection.DetectedText.charAt(4) === ' ' && textDetection.DetectedText.charAt(9) === ' ') {
          isAadharCardValid = true;
          break;
        }
      }
    }

    // Compare faces in user's photo and Aadhar card photo
    const faceMatchParams = {
      SimilarityThreshold: 80, // You can adjust this threshold as needed
      SourceImage: {
        S3Object: {
          Bucket: bucketName,
          Name: userPhoto,
        },
      },
      TargetImage: {
        S3Object: {
          Bucket: bucketName,
          Name: aadharPhoto,
        },
      },
    };

    const faceComparisonResult = await rekognitionClient.compareFaces(faceMatchParams).promise();
    const isFaceMatched = faceComparisonResult.FaceMatches.length > 0;

    console.log('Aadhar card is valid:', isAadharCardValid);
    console.log('Face matched:', isFaceMatched);

    res.status(200).json({ validAadharCard: isAadharCardValid, faceMatched: isFaceMatched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the Express.js server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
