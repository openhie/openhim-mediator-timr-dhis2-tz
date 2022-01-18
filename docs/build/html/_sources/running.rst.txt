Running the mediator and logs location
======================================
The mediator can be run using below commands

.. code-block:: bash

  sudo service timr-dhis2-mediator start

The mediator can be manually run as well using below commands

.. code-block:: bash

   cd openhim-mediator-timr-dhis2-tz
   node index.js

To view logs, run below command

.. code-block:: bash

  sudo journalctl -f -u timr-dhis2-mediator.service

