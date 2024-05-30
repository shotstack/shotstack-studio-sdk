import { useState } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import StudioEditor from './components/StudioEditor';
import data from './template/template.json';

function App() {
  const [template, setTemplate] = useState(data);
  
  const style = {
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
  };

  const control = (action) => {
    const newTemplate = { ...template };

    switch (action) {
      case 'deleteTopTrack':
        newTemplate.timeline.tracks.shift();
        
        setTemplate(newTemplate);
        
        break;
      case 'text':
        const textClip = {
          asset: {
              type: "html",
              html: "<p data-html-type=\"text\">HELLO WORLD</p>",
              css: "p { color: #000000; font-size: 32px; font-family: 'Montserrat ExtraBold'; text-align: center; }",
              width: 500,
              height: 200
          },
          start: 0,
          length: 5,
          transition:{
              out: "fade"
          }
        };

        newTemplate.timeline.tracks.unshift({ clips: [textClip] });
        
        setTemplate(newTemplate);

        break;
      case 'image':
        const imageClip = {
          asset: {
            type: 'image',
            src: 'https://shotstack-assets.s3.amazonaws.com/images/woods1.jpg',
          },
          start: 0,
          length: 5,
        };
        
        newTemplate.timeline.tracks.unshift({ clips: [imageClip] });
        
        setTemplate(newTemplate);
        
        break;
      case 'video':
        const videoClip = {
          asset: {
            type: 'video',
            src: 'https://shotstack-assets.s3.amazonaws.com/footage/night-sky.mp4',
          },
          start: 0,
          length: 5,
        };
        
        newTemplate.timeline.tracks.unshift({ clips: [videoClip] });
        
        setTemplate(newTemplate);
        
        break;
      default:
        break;
    }
  };

  return (
    <div className="App">
      <Container>
        <Row>
          <Col xs={2}>
            <Row>
              <h2>Controls</h2>
            </Row>
            <Row className='my-2'><p>Click the buttons below to control the Studio:</p></Row>
            <Row className='my-2'><button onClick={() => control('deleteTopTrack')}>Remove top track</button></Row>
            <Row className='my-2'><button onClick={() => control('image')}>Add track with image</button></Row>
            <Row className='my-2'><button onClick={() => control('text')}>Add track with text</button></Row>
            <Row className='my-2'><button onClick={() => control('video')}>Add track with video</button></Row>
          </Col>
          <Col xs={10}>
            {template ? (
              <StudioEditor interactive={true} timeline={true} style={style} template={template} />
            ) : (
              <p>Loading Studio...</p>
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default App;
