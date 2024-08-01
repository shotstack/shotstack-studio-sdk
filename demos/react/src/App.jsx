import { useState } from 'react';
import { Container, Row, Col, Button } from 'react-bootstrap';

import { useShotstack } from './lib/shotstack/ShotstackContext';
import StudioEditor from './lib/shotstack/StudioEditor';

import firstTemplate from './template/template_1.json';
import secondTemplate from './template/template_2.json';

function App() {
  const [template, setTemplate] = useState(firstTemplate);
  const shotstack = useShotstack();

  const style = {
    colors: {
      primaryColor: '#2ecc71',
      secondaryColor: '#fd79a8',
    },
    logo: {
      url: 'https://shotstack-assets.s3.amazonaws.com/icons/unicorn.svg',
    },
  };

  const handleUpdateEvent = event => {
    // Your event handling logic here
    console.log('Update event received:', event);
  };

  const handleLoadResources = () => {
    if (shotstack) {
      shotstack.load(secondTemplate, (err, response) => {
        if (err) {
          console.error('Error loading resource:', err);
        } else {
          console.log('Resource loaded:', response);
        }
      });
    }
  };

  return (
    <div className="App">
      <Container>
        <Row>
          <Col xs={12}>
            {template ? (
              <StudioEditor
                owner="oknugu1pfd"
                interactive={true}
                timeline={true}
                sidebar={true}
                controls={true}
                style={style}
                template={template}
                onUpdateEvent={handleUpdateEvent}
              />
            ) : (
              <p>Loading Studio...</p>
            )}
          </Col>
        </Row>
        <Row style={{ marginTop: '20px' }}>
          <Col xs={12}>
            <Button onClick={handleLoadResources}>Load Template</Button>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default App;
